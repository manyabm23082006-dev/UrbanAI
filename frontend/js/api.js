// ════════════════════════════════════════════════════════════════
// API CLIENT — every network call to the FastAPI backend goes through
// this file. Nothing else in script.js talks to fetch() for backend data.
// ════════════════════════════════════════════════════════════════
const API = (() => {
  let savedBase = localStorage.getItem('tai_api_base');
  let BASE = savedBase || (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' 
    ? 'http://127.0.0.1:8000' 
    : window.location.origin);
  let TOKEN = localStorage.getItem('tai_token') || '';

  function setBase(url) {
    BASE = url.replace(/\/$/, '');
    localStorage.setItem('tai_api_base', BASE);
  }
  function getBase() { return BASE; }

  function setToken(t) {
    TOKEN = t || '';
    if (t) localStorage.setItem('tai_token', t);
    else localStorage.removeItem('tai_token');
  }
  function getToken() { return TOKEN; }

  async function req(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
    let res;
    try {
      res = await fetch(BASE + path, Object.assign({}, opts, { headers }));
    } catch (networkErr) {
      throw new Error(
        `Could not reach the server at "${BASE || window.location.origin}". ` +
        `Check that the backend is running, and that the API Base URL in ` +
        `the sign-in screen's Advanced settings matches where it's hosted.`
      );
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(
        `The server at "${BASE || window.location.origin}" responded with ${contentType || 'no'} ` +
        `content instead of JSON for ${path}.`
      );
    }
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail || detail; } catch (e) {}
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function reqMultipart(path, form) {
    const headers = {};
    if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
    let res;
    try {
      res = await fetch(BASE + path, { method: 'POST', headers, body: form });
    } catch (networkErr) {
      throw new Error(`Could not reach the server at "${BASE || window.location.origin}" while uploading to ${path}.`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`The server responded with ${contentType || 'no'} content instead of JSON for ${path}.`);
    }
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail || detail; } catch (e) {}
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    return res.json();
  }

  return {
    setBase, getBase, setToken, getToken,
    // auth
    register: (name, email, password, role) => req('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role }) }),
    login: (identifier, password) => req('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }),
    registerCitizen: (payload) => req('/api/v1/auth/register/citizen', { method: 'POST', body: JSON.stringify(payload) }),
    checkAvailability: (params) => req('/api/v1/auth/check-availability?' + new URLSearchParams(params).toString()),
    requestOtp: (mobile, purpose = 'registration') => req('/api/v1/auth/otp/request', { method: 'POST', body: JSON.stringify({ mobile, purpose }) }),
    verifyOtp: (mobile, code, purpose = 'registration') => req('/api/v1/auth/otp/verify', { method: 'POST', body: JSON.stringify({ mobile, code, purpose }) }),
    uploadRegistrationDocument: async (docType, file) => {
      const form = new FormData();
      form.append('file', file);
      return reqMultipart(`/api/v1/auth/register/upload-document?doc_type=${encodeURIComponent(docType)}`, form);
    },
    changePassword: (current_password, new_password) => req('/api/v1/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }),
    notifications: () => req('/api/v1/notifications'),
    me: () => req('/api/v1/auth/me'),
    // traffic
    records: (limit = 20) => req(`/api/v1/traffic/records?limit=${limit}`),
    predict: (distance_km, hour, day_of_week) => req('/api/v1/traffic/predict', { method: 'POST', body: JSON.stringify({ distance_km, hour, day_of_week }) }),
    forecast: (cg) => req(`/api/v1/traffic/forecast?current_congestion=${cg}`),
    route: (fromLat, fromLon, toLat, toLon) => req('/api/v1/traffic/route', { method: 'POST', body: JSON.stringify({ from_lat: fromLat, from_lon: fromLon, to_lat: toLat, to_lon: toLon }) }),
    geocode: (q, limit = 8) => req(`/api/v1/traffic/geocode?q=${encodeURIComponent(q)}&limit=${limit}`),
    reverseGeocode: (lat, lon) => req(`/api/v1/traffic/reverse-geocode?lat=${lat}&lon=${lon}`),
    // sensors / incidents / reports
    sensors: () => req('/api/v1/sensors'),
    incidents: () => req('/api/v1/incidents'),
    createIncident: (payload) => req('/api/v1/incidents', { method: 'POST', body: JSON.stringify(payload) }),
    reports: () => req('/api/v1/reports'),
    myReports: () => req('/api/v1/reports/mine'),
    publicReports: () => req('/api/v1/reports/public'),
    createReport: (payload) => req('/api/v1/reports', { method: 'POST', body: JSON.stringify(payload) }),
    uploadPhoto: async (file) => {
      const form = new FormData();
      form.append('file', file);
      return reqMultipart('/api/v1/reports/upload-photo', form);
    },
    // chat
    ask: (message, context) => req('/api/v1/chat/ask', { method: 'POST', body: JSON.stringify({ message, context }) }),
    // websocket
    liveSocket: () => new WebSocket(BASE.replace(/^http/, 'ws') + '/ws/live'),
    // citizen vehicles
    myVehicles: () => req('/api/v1/vehicles'),
    addVehicle: (payload) => req('/api/v1/vehicles', { method: 'POST', body: JSON.stringify(payload) }),
    deleteVehicle: (id) => req(`/api/v1/vehicles/${id}`, { method: 'DELETE' }),
    addDocument: (vehicleId, payload) => req(`/api/v1/vehicles/${vehicleId}/documents`, { method: 'POST', body: JSON.stringify(payload) }),
    expiringDocuments: () => req('/api/v1/vehicles/expiring'),
    // traffic police enforcement
    violations: () => req('/api/v1/enforcement/violations'),
    recordViolation: (payload) => req('/api/v1/enforcement/violations', { method: 'POST', body: JSON.stringify(payload) }),
    payChallan: (id) => req(`/api/v1/enforcement/challans/${id}/pay`, { method: 'PATCH' }),
    lookupVehicle: (regNumber) => req(`/api/v1/enforcement/lookup?reg_number=${encodeURIComponent(regNumber)}`),
    flaggedVehicles: () => req('/api/v1/enforcement/flagged-vehicles'),
    myChallans: () => req('/api/v1/enforcement/my-challans'),
    inspectVehicle: (regNumber, notes) => req(`/api/v1/enforcement/vehicles/${encodeURIComponent(regNumber)}/inspect`, { method: 'POST', body: JSON.stringify({ notes }) }),
    notifyControlRoom: (message, reg_number) => req('/api/v1/enforcement/notify-control-room', { method: 'POST', body: JSON.stringify({ message, reg_number }) }),
    incidentTimeline: (id) => req(`/api/v1/incidents/${id}/timeline`),
    governmentAnalytics: () => req('/api/v1/government/analytics'),
    // municipality
    repairQueue: () => req('/api/v1/municipality/repair-queue'),
    budgetForecast: () => req('/api/v1/municipality/budget-forecast'),
    // Medical Emergency module
    reportEmergency: (payload) => req('/api/v1/emergency', { method: 'POST', body: JSON.stringify(payload) }),
    myEmergencies: () => req('/api/v1/emergency/mine'),
    firstAidGuidance: () => req('/api/v1/emergency/first-aid'),
    emergencyContacts: () => req('/api/v1/emergency/contacts'),
    addEmergencyContact: (payload) => req('/api/v1/emergency/contacts', { method: 'POST', body: JSON.stringify(payload) }),
    deleteEmergencyContact: (id) => req(`/api/v1/emergency/contacts/${id}`, { method: 'DELETE' }),
    activeEmergencies: () => req('/api/v1/emergency/active'),
    emergencyHistory: () => req('/api/v1/emergency/history'),
    emergencyUpdates: (id) => req(`/api/v1/emergency/${id}/updates`),
    updateEmergencyStatus: (id, status, note) => req(`/api/v1/emergency/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, note }) }),
    availableUnits: () => req('/api/v1/emergency/units/available'),
    assignUnit: (id, unit_id, eta_minutes) => req(`/api/v1/emergency/${id}/assign`, { method: 'POST', body: JSON.stringify({ unit_id, eta_minutes }) }),
    updateResolution: (id, payload) => req(`/api/v1/emergency/${id}/resolution`, { method: 'PATCH', body: JSON.stringify(payload) }),
    flagInfrastructure: (id) => req(`/api/v1/emergency/${id}/flag-infrastructure`, { method: 'POST' }),
    emergencyNumbers: () => req('/api/v1/emergency-numbers'),
    // saved places
    savedPlaces: () => req('/api/v1/places'),
    savePlace: (payload) => req('/api/v1/places', { method: 'POST', body: JSON.stringify(payload) }),
    deleteSavedPlace: (id) => req(`/api/v1/places/${id}`, { method: 'DELETE' }),
    // government
    cityHealth: () => req('/api/v1/government/city-health'),
    wards: () => req('/api/v1/government/wards'),
    // live navigation
    startLiveNav: (payload) => req('/api/v1/live-nav/start', { method: 'POST', body: JSON.stringify(payload) }),
    stopLiveNav: (id) => req(`/api/v1/live-nav/${id}/stop`, { method: 'POST' }),
    activeNavigations: () => req('/api/v1/live-nav/active'),
    // datasets
    listDatasets: () => req('/api/v1/datasets'),
    uploadDataset: async (file) => {
      const form = new FormData();
      form.append('file', file);
      return reqMultipart('/api/v1/datasets/upload', form);
    },
  };
})();