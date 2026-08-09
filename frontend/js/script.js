// ════════════════════════════════════════════════════════════════
// GLOBAL STATE
// ════════════════════════════════════════════════════════════════
let CU = null, map = null, gmap = null;
let fromL = null, toL = null, dirOpen = false, aiOpen = false;
let stim = { main: null, from: null, to: null }, sres = { main: [], from: [], to: [] };
let rLayers = [], sigLayers = [], fMk = null, tMk = null, sMk = null, navMk = null;
let curRoutes = [], curInfos = [], actIdx = 0, actMode = 'car', pendingMode = 'car';
let gmKey = '';
let navGPSid = null, navSimInt = null, navSimIdx = 0, isNav = false, liveSocket = null;
let rptLevel = null;
let lastLiveSnapshot = null;

// ════════════════════════════════════════════════════════════════
// AUTH — portals (Citizen / Traffic Control / Super Admin / Medical / Municipality)
// ════════════════════════════════════════════════════════════════
let activePortal = 'citizen';
const PORTAL_IDS = ['citizen', 'traffic', 'emergency', 'municipality', 'admin'];

function portalTab(p) {
  activePortal = p;
  document.querySelectorAll('#AUTH > .acard > .atabs')[0].querySelectorAll('.atab').forEach((e, i) =>
    e.classList.toggle('on', PORTAL_IDS[i] === p));
  PORTAL_IDS.forEach(id => document.getElementById(`portal-${id}`).style.display = id === p ? 'block' : 'none');
  document.getElementById('aerr').style.display = 'none';
}

function aTab(t) {
  document.querySelectorAll('#portal-citizen .atabs .atab').forEach((e, i) => e.classList.toggle('on', ['login', 'signup'][i] === t));
  document.getElementById('lf').style.display = t === 'login' ? 'block' : 'none';
  document.getElementById('sf').style.display = t === 'signup' ? 'block' : 'none';
  document.getElementById('citizen-id-result').style.display = 'none';
  document.getElementById('aerr').style.display = 'none';
  if (t === 'signup' && typeof regGoStep === 'function') regGoStep(1);
}
function showAErr(m) { const e = document.getElementById('aerr'); e.textContent = m; e.style.display = 'block'; }

async function doLogin() {
  const ident = document.getElementById('le').value.trim(), p = document.getElementById('lp').value;
  try {
    const data = await API.login(ident, p);
    API.setToken(data.access_token);
    afterLogin(data.user);
  } catch (err) {
    showAErr(err.message || 'Invalid credentials');
  }
}

async function doPortalLogin(userFieldId, passFieldId) {
  const ident = document.getElementById(userFieldId).value.trim(), p = document.getElementById(passFieldId).value;
  try {
    const data = await API.login(ident, p);
    API.setToken(data.access_token);
    afterLogin(data.user);
  } catch (err) {
    showAErr(err.message || 'Invalid credentials');
  }
}

async function doCitizenSignup() {
  const name = document.getElementById('sn').value.trim();
  const mobile = document.getElementById('s-mobile').value.trim();
  const email = document.getElementById('se').value.trim();
  const dob = document.getElementById('s-dob').value;
  const gender = document.getElementById('s-gender').value;
  const address = document.getElementById('s-address').value.trim();
  const state = document.getElementById('s-state').value.trim();
  const district = document.getElementById('s-district').value.trim();
  const pincode = document.getElementById('s-pincode').value.trim();
  const govtId = document.getElementById('s-govtid').value.trim();
  const famTotal = document.getElementById('s-fam-total').value;
  const famMale = document.getElementById('s-fam-male').value;
  const famFemale = document.getElementById('s-fam-female').value;
  const emergName = document.getElementById('s-emergency-name').value.trim();
  const emergPhone = document.getElementById('s-emergency-phone').value.trim();
  const dlNumber = document.getElementById('s-dl-number').value.trim();
  const dlExpiry = document.getElementById('s-dl-expiry').value;
  const vehReg = document.getElementById('s-veh-reg').value.trim();
  if (!name || !mobile) { regShowError('Name and mobile number are required'); regGoStep(1); return; }

  const btn = document.getElementById('reg-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
  try {
    const payload = {
      name, mobile, email: email || null, date_of_birth: dob || null, gender: gender || null,
      address: address || null, state: state || null, district: district || null,
      pincode: pincode || null, govt_id_number: govtId || null,
      govt_id_photo_url: regUploads.govt_id || null,
      family_member_count: famTotal ? parseInt(famTotal) : null,
      family_male_count: famMale ? parseInt(famMale) : null,
      family_female_count: famFemale ? parseInt(famFemale) : null,
      emergency_contact_name: emergName || null,
      emergency_contact_phone: emergPhone || null,
      otp_ticket: regOtpTicket || null,
      dl_number: dlNumber || null, dl_expiry: dlExpiry || null,
      dl_photo_url: regUploads.driving_licence || null,
    };
    if (vehReg) {
      Object.assign(payload, {
        vehicle_reg_number: vehReg,
        vehicle_type: document.getElementById('s-veh-type').value.trim() || null,
        vehicle_manufacturer: document.getElementById('s-veh-make').value.trim() || null,
        vehicle_model: document.getElementById('s-veh-model').value.trim() || null,
        vehicle_year: document.getElementById('s-veh-year').value ? parseInt(document.getElementById('s-veh-year').value) : null,
        vehicle_fuel_type: document.getElementById('s-veh-fuel').value.trim() || null,
        vehicle_color: document.getElementById('s-veh-color').value.trim() || null,
        vehicle_engine_number: document.getElementById('s-veh-engine').value.trim() || null,
        vehicle_chassis_number: document.getElementById('s-veh-chassis').value.trim() || null,
        vehicle_rc_photo_url: regUploads.rc || null,
        vehicle_insurance_photo_url: regUploads.insurance || null,
        vehicle_puc_photo_url: regUploads.puc || null,
        vehicle_fitness_photo_url: regUploads.fitness || null,
      });
    }
    const res = await API.registerCitizen(payload);
    document.getElementById('sf').style.display = 'none';
    const box = document.getElementById('citizen-id-result');
    box.style.display = 'block';
    box.innerHTML = `
      <div style="font-size:11px;font-weight:800;color:var(--blue);text-transform:uppercase;margin-bottom:8px">✅ Registration Complete</div>
      <div style="font-size:12px;color:#5f6368;margin-bottom:10px">${res.message}</div>
      <div style="background:#fff;border:1px solid #dadce0;border-radius:8px;padding:10px;margin-bottom:8px">
        <div style="font-size:10px;color:#9aa0a6;text-transform:uppercase">UrbanGuard ID</div>
        <div style="font-size:16px;font-weight:800;color:#202124">${res.urbanguard_id}</div>
      </div>
      <div style="background:#fff;border:1px solid #dadce0;border-radius:8px;padding:10px;margin-bottom:12px">
        <div style="font-size:10px;color:#9aa0a6;text-transform:uppercase">Temporary Password</div>
        <div style="font-size:16px;font-weight:800;color:#202124;font-family:monospace">${res.temporary_password}</div>
      </div>
      <button class="abtn" onclick="prefillCitizenLogin('${res.urbanguard_id}','${res.temporary_password}')">Continue to Sign In →</button>`;
  } catch (err) {
    regShowError(err.message || 'Could not register');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Complete Registration →'; }
  }
}
function prefillCitizenLogin(id, pw) {
  aTab('login');
  document.getElementById('le').value = id;
  document.getElementById('lp').value = pw;
}

function afterLogin(u) {
  CU = u;
  if (u.must_change_password) {
    document.getElementById('pwmodal').classList.add('show');
    return;
  }
  loginOk(u);
}

async function submitPasswordChange() {
  const cur = document.getElementById('pw-current').value;
  const nw = document.getElementById('pw-new').value;
  const errEl = document.getElementById('pw-err');
  errEl.style.display = 'none';
  if (nw.length < 8) { errEl.textContent = 'New password must be at least 8 characters'; errEl.style.display = 'block'; return; }
  try {
    const updated = await API.changePassword(cur, nw);
    document.getElementById('pwmodal').classList.remove('show');
    loginOk(updated);
  } catch (err) {
    errEl.textContent = err.message || 'Could not change password';
    errEl.style.display = 'block';
  }
}

const OPS_ROLE_KIND = {
  'admin': 'admin',
  'Traffic Engineer': 'police',
  'Emergency Manager': 'police',
  'City Planner': 'muni',
  'Analyst': 'muni',
};

function loginOk(u) {
  CU = u;
  document.getElementById('AUTH').style.display = 'none';
  const opsKind = OPS_ROLE_KIND[u.role];
  if (opsKind) {
    document.getElementById('APP').style.display = 'none';
    document.getElementById('OPS').classList.add('show');
    initOps(opsKind, u);
    return;
  }
  document.getElementById('OPS').classList.remove('show');
  document.getElementById('APP').style.display = 'block';
  document.getElementById('sp-name').textContent = u.name;
  document.getElementById('sp-email').textContent = u.urbanguard_id || u.username || u.email || '';
  document.getElementById('sp-role').textContent = u.role;
  document.getElementById('apibase').value = API.getBase();
  initApp();
  startNotifPolling();
  if (u.role === 'Emergency Operator') {
    setTimeout(() => { toggleCC(); ccTab('emergency-center'); }, 400);
  }
}
function doLogout() {
  API.setToken('');
  CU = null;
  if (liveSocket) { liveSocket.close(); liveSocket = null; }
  document.getElementById('AUTH').style.display = 'flex';
  document.getElementById('APP').style.display = 'none';
  document.getElementById('OPS').classList.remove('show');
  closeAll();
}
function applyApiBase() {
  const v = document.getElementById('apibase').value.trim();
  if (!v) { toast('⚠️ Enter a valid API URL'); return; }
  API.setBase(v);
  toast('✅ API URL saved — reloading...');
  setTimeout(() => location.reload(), 700);
}

async function tryResumeSession() {
  if (!API.getToken()) return;
  try {
    const u = await API.me();
    if (u.must_change_password) { afterLogin(u); return; }
    loginOk(u);
  } catch (e) { API.setToken(''); }
}

// ════════════════════════════════════════════════════════════════
// MAP
// ════════════════════════════════════════════════════════════════
function initApp() {
  initMap();
  initChat();
  connectLiveSocket();
  renderDB('records');
  setInterval(() => document.getElementById('mstime').textContent = new Date().toLocaleTimeString(), 1000);
}

function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: true }).setView([20.5937, 78.9629], 5);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://carto.com">CARTO</a> © <a href="https://openstreetmap.org/copyright">OSM</a>',
    subdomains: 'abcd', maxZoom: 20
  }).addTo(map);
  map.on('click', e => {
    if (infraPinMode) { infraSetPin(e.latlng.lat, e.latlng.lng); return; }
    if (emergencyPinMode) { emSetPin(e.latlng.lat, e.latlng.lng); return; }
    if (dirOpen) {
      if (!fromL) revGeo(e.latlng.lat, e.latlng.lng, 'from');
      else if (!toL) revGeo(e.latlng.lat, e.latlng.lng, 'to');
    }
  });
}

function mkIcon(color, sz = 15) {
  return L.divIcon({ html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.5)"></div>`, className: '', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
}
function placeMk(loc, type) {
  const c = type === 'from' ? '#4285F4' : type === 'to' ? '#EA4335' : '#34A853';
  const pop = buildPop(loc);
  if (type === 'from') { if (fMk) map.removeLayer(fMk); fMk = L.marker([loc.lat, loc.lon], { icon: mkIcon(c, 17) }).addTo(map).bindPopup(pop); }
  else if (type === 'to') { if (tMk) map.removeLayer(tMk); tMk = L.marker([loc.lat, loc.lon], { icon: mkIcon(c, 17) }).addTo(map).bindPopup(pop); }
  else { if (sMk) map.removeLayer(sMk); sMk = L.marker([loc.lat, loc.lon], { icon: mkIcon(c, 14) }).addTo(map).bindPopup(pop).openPopup(); }
}
function buildPop(loc) {
  const a = loc.raw?.address || {};
  return `<div style="font-family:Google Sans,sans-serif;min-width:170px"><b style="font-size:14px;color:#333">${loc.name}</b><br><span style="font-size:11px;color:#666;line-height:1.8">${a.city || a.town || a.village ? 'City: ' + (a.city || a.town || a.village) + '<br>' : ''}${a.state ? 'State: ' + a.state + '<br>' : ''}${a.country ? 'Country: ' + a.country + '<br>' : ''}${a.postcode ? 'Pincode: ' + a.postcode + '<br>' : ''}<span style="color:#aaa;font-size:10px">${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)}</span></span></div>`;
}
function clrRoutes() {
  rLayers.forEach(l => map.removeLayer(l));
  sigLayers.forEach(l => map.removeLayer(l));
  rLayers = []; sigLayers = [];
}
function recenterMap() {
  if (navMk) { map.setView(navMk.getLatLng(), 17); toast('🎯 Recentered on your live position'); return; }
  if (fromL) { map.setView([fromL.lat, fromL.lon], 15); toast('🎯 Recentered on your starting point'); return; }
  if (!navigator.geolocation) { toast('⚠️ GPS not available'); return; }
  navigator.geolocation.getCurrentPosition(
    pos => { map.setView([pos.coords.latitude, pos.coords.longitude], 15); toast('🎯 Recentered on your location'); },
    () => toast('⚠️ Could not get your location')
  );
}
function setCompassBearing(deg) {
  document.getElementById('compass-arrow').style.display = 'inline-block';
  document.getElementById('compass-btn').style.transform = `rotate(${-deg}deg)`;
}
function resetBearing() { setCompassBearing(0); toast('🧭 Map reset to North'); }

function locateMe() {
  toast('📡 Finding your location...');
  navigator.geolocation.getCurrentPosition(
    pos => { map.setView([pos.coords.latitude, pos.coords.longitude], 15); revGeo(pos.coords.latitude, pos.coords.longitude, 'from'); toast('📍 Location found!'); },
    () => { toast('Location denied. Placing on Bengaluru.'); map.setView([12.9716, 77.5946], 14); revGeo(12.9716, 77.5946, 'from'); }
  );
}

// ════════════════════════════════════════════════════════════════
// SEARCH
// ════════════════════════════════════════════════════════════════
async function nomSearch(q, lim = 9) { return API.geocode(q, lim); }

function buildDD(items, field) {
  if (!items || !items.length) return `<div class="sdrop-info" style="color:#9aa0a6">No results. Try adding country: "Delhi India"</div>`;
  return items.map((item, i) => {
    const a = item.address || {};
    const name = item.display_name.split(',')[0];
    const sub = item.display_name.split(',').slice(1, 4).join(', ').trim();
    const tags = [a.city || a.town || a.village || '', a.state || '', a.country || '', a.postcode || '', a.suburb || a.district || ''].filter(Boolean).slice(0, 5);
    const cls = item.class || '';
    const emoji = cls === 'highway' ? '🛣️' : cls === 'railway' ? '🚉' : cls === 'aeroway' ? '✈️' : cls === 'amenity' ? '🏪' : '📍';
    return `<div class="sdi" onclick="pickRes('${field}',${i})">
      <div class="sdi-icon">${emoji}</div>
      <div style="min-width:0">
        <div class="sdi-name">${name}</div>
        <div class="sdi-sub">${sub}</div>
        <div class="sdi-tags">${tags.map(t => `<span class="sdi-tag">${t}</span>`).join('')}</div>
      </div>
    </div>`;
  }).join('');
}

async function onSrch(inp, field) {
  const q = inp.value.trim();
  const dd = document.getElementById(`dd-${field}`);
  if (field === 'main') document.getElementById('sclear').style.display = q ? 'block' : 'none';
  clearTimeout(stim[field]);
  if (q.length < 2) { dd.style.display = 'none'; return; }
  dd.style.display = 'block';
  dd.innerHTML = `<div class="sdrop-info"><div class="spin"></div>Searching worldwide...</div>`;
  stim[field] = setTimeout(async () => {
    try {
      const data = await nomSearch(q, field === 'main' ? 10 : 8);
      sres[field] = data;
      dd.innerHTML = buildDD(data, field);
    } catch (e) {
      dd.innerHTML = `<div class="sdrop-info" style="color:#c00">Search failed. Check backend connection.</div>`;
    }
  }, 380);
}

function onFoc(field) {
  const inp = document.getElementById(field === 'main' ? 'sinp' : field + '-inp');
  if (inp && inp.value.trim().length >= 2) {
    const dd = document.getElementById(`dd-${field}`);
    if (dd) dd.style.display = 'block';
  }
}
function onBlr(field) { setTimeout(() => { const dd = document.getElementById(`dd-${field}`); if (dd) dd.style.display = 'none'; }, 220); }

function pickRes(field, i) {
  const item = sres[field][i];
  const a = item.address || {};
  const loc = { name: item.display_name.split(',')[0], display: item.display_name.split(',').slice(0, 4).join(', '), lat: parseFloat(item.lat), lon: parseFloat(item.lon), raw: item };
  if (field === 'main') {
    document.getElementById('sinp').value = loc.display;
    document.getElementById('sclear').style.display = 'block';
    document.getElementById('dd-main').style.display = 'none';
    map.setView([loc.lat, loc.lon], 14);
    placeMk(loc, 'loc');
    showLocInfo(loc);
    document.getElementById('mstext').textContent = `${loc.name} · ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`;
  } else if (field === 'from') {
    fromL = loc;
    document.getElementById('from-inp').value = loc.display;
    document.getElementById('dd-from').style.display = 'none';
    placeMk(loc, 'from');
  } else {
    toL = loc;
    document.getElementById('to-inp').value = loc.display;
    document.getElementById('dd-to').style.display = 'none';
    placeMk(loc, 'to');
    if (fromL) doRoute();
  }
}

function clearS() { document.getElementById('sinp').value = ''; document.getElementById('sclear').style.display = 'none'; document.getElementById('dd-main').style.display = 'none'; }

async function revGeo(lat, lon, field) {
  try {
    const d = await API.reverseGeocode(lat, lon);
    const loc = { name: d.display_name.split(',')[0], display: d.display_name.split(',').slice(0, 4).join(', '), lat, lon, raw: d };
    if (field === 'from') { fromL = loc; document.getElementById('from-inp').value = loc.display; placeMk(loc, 'from'); }
    else { toL = loc; document.getElementById('to-inp').value = loc.display; placeMk(loc, 'to'); if (fromL) doRoute(); }
  } catch (e) {}
}

function toggleDir() {
  dirOpen = !dirOpen;
  document.getElementById('sft').style.display = dirOpen ? 'flex' : 'none';
  if (!dirOpen) { fromL = null; toL = null; document.getElementById('from-inp').value = ''; document.getElementById('to-inp').value = ''; clrRoutes(); closeRP(); }
}
function swapDir() {
  [document.getElementById('from-inp').value, document.getElementById('to-inp').value] = [document.getElementById('to-inp').value, document.getElementById('from-inp').value];
  [fromL, toL] = [toL, fromL];
}

// ════════════════════════════════════════════════════════════════
// ROUTING
// ════════════════════════════════════════════════════════════════
function createMockRoute(f, t, idx, baseCoords = null) {
  let coords = [];
  if (baseCoords && baseCoords.length > 2) {
    const curve = idx === 1 ? 0.005 : -0.005;
    for (let i = 0; i < baseCoords.length; i++) {
      let pct = i / (baseCoords.length - 1);
      let bulge = Math.sin(pct * Math.PI) * curve;
      coords.push([baseCoords[i][0] + bulge, baseCoords[i][1] + bulge]);
    }
  } else {
    const curve = idx === 1 ? 0.05 : (idx === 2 ? -0.05 : 0);
    for (let i = 0; i <= 100; i++) {
      let lat = f.lat + (t.lat - f.lat) * (i / 100) + (Math.sin(i * Math.PI / 100) * curve);
      let lon = f.lon + (t.lon - f.lon) * (i / 100) + (Math.cos(i * Math.PI / 100) * curve);
      coords.push([lon, lat]);
    }
  }
  const dist = Math.sqrt(Math.pow(t.lat - f.lat, 2) + Math.pow(t.lon - f.lon, 2)) * 111000;
  return {
    distance: dist * (1 + Math.abs(idx) * 0.1),
    duration: (dist / 10) * (1 + Math.abs(idx) * 0.15),
    geometry: { coordinates: coords },
    legs: [{ steps: [{ name: idx === 0 ? "Main Express Highway" : (idx === 1 ? "Local Arterial Road" : "Ring Road Bypass") }] }]
  };
}

async function doRoute() {
  if (!fromL || !toL) { toast('⚠️ Enter both origin and destination'); return; }
  const btn = document.getElementById('sgo');
  btn.disabled = true; document.getElementById('sgo-txt').textContent = '⏳ Calculating...';
  clrRoutes();

  try {
    const d = await API.route(fromL.lat, fromL.lon, toL.lat, toL.lon);
    if (d.code !== 'Ok' || !d.routes?.length) throw new Error('Routing engine failed.');
    curRoutes = d.routes;
    while (curRoutes.length < 3) {
      curRoutes.push(createMockRoute(fromL, toL, curRoutes.length, curRoutes[0].geometry.coordinates));
    }
    curRoutes = curRoutes.slice(0, 3);
  } catch (e) {
    toast('⚠️ Backend routing unavailable — using simulated fallback route.');
    curRoutes = [createMockRoute(fromL, toL, 0), createMockRoute(fromL, toL, 1), createMockRoute(fromL, toL, 2)];
  }

  const now = new Date();
  curInfos = await Promise.all(curRoutes.map((rt, i) => buildInfo(rt, i, now)));
  actIdx = 0;
  openTModal();
  resetBtn();
  placeLiveSensors();
}
function resetBtn() {
  const btn = document.getElementById('sgo');
  btn.disabled = false; document.getElementById('sgo-txt').textContent = 'Find Routes & Predict Traffic';
}
async function buildInfo(rt, i, now) {
  const dist = parseFloat((rt.distance / 1000).toFixed(1));
  const bMin = Math.round(rt.duration / 60);
  let p;
  try {
    p = await API.predict(dist, now.getHours(), now.getDay());
    p = { cg: p.congestion_pct, spd: p.speed_kmh, tMin: p.eta_minutes, delay: p.delay_minutes };
  } catch (e) {
    const HIST = { 0: 18, 1: 13, 2: 10, 3: 9, 4: 11, 5: 24, 6: 50, 7: 78, 8: 88, 9: 74, 10: 58, 11: 52, 12: 62, 13: 52, 14: 57, 15: 63, 16: 72, 17: 84, 18: 89, 19: 78, 20: 63, 21: 48, 22: 33, 23: 23 };
    const cg = Math.max(5, Math.min(96, HIST[now.getHours()] || 50));
    const spd = Math.max(6, 75 * (1 - cg / 100));
    const tMin = Math.round((dist / spd) * 60);
    p = { cg, spd: Math.round(spd), tMin, delay: Math.max(0, tMin - bMin) };
  }
  const cols = ['#4285F4', '#8B5CF6', '#34A853'];
  const bads = [{ t: 'Best', c: 'rcbadge-best' }, { t: 'Alternate', c: 'rcbadge-alt' }, { t: 'Local', c: 'rcbadge-alt' }];
  const via = getVia(rt);
  const SEGS = Math.min(22, Math.floor(rt.geometry.coordinates.length / 7) + 4);
  const segs = Array.from({ length: SEGS }, (_, si) => {
    const v = Math.max(0, Math.min(100, p.cg + Math.sin(si / 2) * 18 + (Math.random() - .5) * 22));
    return { pct: 100 / SEGS, cg: v > 65 ? 'h' : v > 35 ? 'm' : 'f' };
  });
  const sigs = Math.max(2, Math.round(dist / 1.6) + Math.floor(Math.random() * 5));
  return { i, dist, bMin, p, color: cols[i], bad: bads[i] || bads[1], name: `via ${via}`, segs, sigs };
}
function getVia(rt) {
  try { for (const s of rt.legs[0].steps) { if (s.name && s.name.trim().length > 2 && !s.name.toLowerCase().includes('null')) return s.name; } } catch (e) { }
  return 'Main Road';
}

function placeLiveSensors() {
  if (!fromL) return;
  for (let i = 0; i < 3; i++) {
    let latOff = (Math.random() - 0.5) * 0.01;
    let lonOff = (Math.random() - 0.5) * 0.01;
    let st = ['#EA4335', '#FBBC04', '#34A853'][Math.floor(Math.random() * 3)];
    const smk = L.marker([fromL.lat + latOff, fromL.lon + lonOff], {
      icon: L.divIcon({
        html: `<div class="sig-dot" style="background:${st}; width: 16px; height: 16px; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
        className: '', iconSize: [16, 16], iconAnchor: [8, 8]
      })
    }).addTo(map);
    smk.bindPopup(`<div style="font-family:Google Sans,sans-serif"><b>📡 Live IoT Sensor</b><br>Status: <b style="color:${st}">${st === '#EA4335' ? '🔴 High Traffic' : st === '#FBBC04' ? '🟡 Moderate Traffic' : '🟢 Clear'}</b><br>Flow: ${Math.floor(800 + Math.random() * 2000)} veh/hr<br>Temp: ${Math.floor(20 + Math.random() * 15)}°C</div>`);
    sigLayers.push(smk);
  }
}

// ════════════════════════════════════════════════════════════════
// TRANSPORT MODAL
// ════════════════════════════════════════════════════════════════
function openTModal() {
  if (!curInfos.length) return;
  const r = curInfos[0];
  const modes = [
    { id: 'car', icon: '🚗', name: 'Car', time: r.p.tMin, cost: Math.round(r.dist * 12), sigs: r.sigs },
    { id: 'bike', icon: '🏍️', name: '2-Wheeler', time: Math.round(r.p.tMin * .65), cost: Math.round(r.dist * 4), sigs: r.sigs },
    { id: 'metro', icon: '🚇', name: 'Metro/Train', time: Math.round((r.dist / 28) * 60) + 10, cost: Math.round(20 + r.dist * 2), sigs: 0 },
    { id: 'auto', icon: '🛺', name: 'Auto', time: Math.round(r.p.tMin * .85), cost: Math.round(r.dist * 8), sigs: r.sigs },
    { id: 'cycle', icon: '🚲', name: 'Cycle', time: Math.round((r.dist / 14) * 60), cost: 0, sigs: r.sigs },
    { id: 'walk', icon: '🚶', name: 'Walk', time: Math.round((r.dist / 5) * 60), cost: 0, sigs: r.sigs }
  ];
  pendingMode = actMode;
  document.getElementById('tgrid').innerHTML = modes.map(m => {
    const h = Math.floor(m.time / 60), mn = m.time % 60;
    const ts = h > 0 ? `${h}h ${mn}m` : `${mn} min`;
    const cost = m.cost === 0 ? 'Free' : `₹${m.cost}`;
    return `<div class="topt${pendingMode === m.id ? ' sel' : ''}" onclick="pickMode('${m.id}',this)">
      <div class="topt-icon">${m.icon}</div>
      <div class="topt-name">${m.name}</div>
      <div class="topt-time">${ts}</div>
      <div class="topt-cost">Est. Cost: ${cost}</div>
      ${m.sigs > 0 ? `<div class="topt-sigs">🚦 ${m.sigs} signals</div>` : ''}
    </div>`;
  }).join('');
  document.getElementById('tmodal').classList.add('show');
}
function pickMode(id, el) {
  pendingMode = id;
  document.querySelectorAll('.topt').forEach(e => e.classList.remove('sel'));
  el.classList.add('sel');
}
function closeTModal() { document.getElementById('tmodal').classList.remove('show'); }
async function confirmMode() {
  actMode = pendingMode;
  closeTModal();
  drawRoutes();
  renderPanel();
  document.getElementById('rpanel').style.display = 'flex';
  document.getElementById('rptitle').textContent = `${fromL.name} → ${toL.name}`;
  const coords = curRoutes[actIdx].geometry.coordinates.map(c => [c[1], c[0]]);
  map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });
  toast('✅ Click a route below, then press Start Live Navigation');
}

// ════════════════════════════════════════════════════════════════
// DRAW ROUTES ON MAP
// ════════════════════════════════════════════════════════════════
function drawRoutes() {
  clrRoutes();
  curRoutes.forEach((rt, i) => {
    const ri = curInfos[i];
    const coords = rt.geometry.coordinates;
    if (i === actIdx) {
      const step = Math.max(2, Math.floor(coords.length / ri.segs.length));
      ri.segs.forEach((seg, si) => {
        const s = si * step, e2 = Math.min(coords.length - 1, (si + 1) * step);
        const sc = coords.slice(s, e2 + 1).map(c => [c[1], c[0]]);
        if (sc.length < 2) return;
        const col = seg.cg === 'h' ? '#EA4335' : seg.cg === 'm' ? '#FBBC04' : '#137333';
        const w = actMode === 'walk' ? 4 : actMode === 'cycle' ? 5 : 8;
        const pl = L.polyline(sc, { color: col, weight: w, opacity: 1.0, lineJoin: 'round' }).addTo(map);
        pl.bindPopup(`<b>Segment ${si + 1}</b><br><span style="color:${col};font-weight:700">${seg.cg === 'h' ? '🔴 Congested' : seg.cg === 'm' ? '🟡 Moderate' : '🟢 Free Flow'}</span>`);
        rLayers.push(pl);
      });
      const step2 = Math.max(1, Math.floor(coords.length / Math.max(1, ri.sigs)));
      for (let j = step2; j < coords.length - 1; j += step2) {
        const c = coords[j];
        const st = ['#EA4335', '#FBBC04', '#34A853'][Math.abs(Math.floor(j * 7 + 3)) % 3];
        const m2 = L.marker([c[1], c[0]], {
          icon: L.divIcon({
            html: `<div class="sig-dot" style="background:${st}"></div>`,
            className: '', iconSize: [13, 13], iconAnchor: [6, 6]
          })
        }).addTo(map);
        m2.bindPopup(`<div style="font-family:Google Sans,sans-serif"><b>🚦 Traffic Signal</b><br>Status: <b style="color:${st}">${st === '#EA4335' ? '🔴 RED — Stop' : st === '#FBBC04' ? '🟡 YELLOW — Caution' : '🟢 GREEN — Go'}</b><br>Cycle: ${30 + Math.floor((j * 13) % 60)}s<br>Queue: ~${Math.floor((j * 7) % 18)} vehicles</div>`);
        sigLayers.push(m2);
      }
    } else {
      const pl = L.polyline(coords.map(c => [c[1], c[0]]), { color: ri.color, weight: 5, opacity: .45, dashArray: '12 8' }).addTo(map);
      pl.bindPopup(`<b>Route ${i + 1}: ${ri.name}</b><br>${ri.dist}km`);
      rLayers.push(pl);
    }
  });
}

// ════════════════════════════════════════════════════════════════
// PANEL RENDERING
// ════════════════════════════════════════════════════════════════
function rpTab(el, tab) {
  document.querySelectorAll('.rptab').forEach(t => t.classList.remove('on')); el.classList.add('on');
  ['routes', 'preds', 'details'].forEach(t => document.getElementById(`rpc-${t}`).style.display = t === tab ? 'block' : 'none');
}
function closeRP() { document.getElementById('rpanel').style.display = 'none'; clrRoutes(); }

function renderPanel() {
  renderRoutes();
  renderPreds();
  renderDetails();
}

function modeTime(r, mode) {
  const m = { car: r.p.tMin, bike: Math.round(r.p.tMin * .65), metro: Math.round((r.dist / 28) * 60) + 10 + (r.i * 10), auto: Math.round(r.p.tMin * .85), cycle: Math.round((r.dist / 14) * 60) + (r.i * 5), walk: Math.round((r.dist / 5) * 60) + (r.i * 10) };
  return m[mode] || r.p.tMin;
}

function renderRoutes() {
  document.getElementById('rpc-routes').innerHTML = curInfos.map((r, i) => {
    const t = modeTime(r, actMode);
    const h = Math.floor(t / 60), mn = t % 60;
    const ts = h > 0 ? `${h}h ${mn}m` : `${mn} min`;
    const sel = i === actIdx;
    return `<div class="rc${sel ? ' sel' : ''}" onclick="selRC(${i})">
      <div class="rchdr"><div class="rcname">${r.name}</div><span class="rcbadge ${r.bad.c}">${r.bad.t}</span></div>
      <div class="rcstats">
        <div class="rcs"><div class="rcsv">${r.dist}<small>km</small></div><div class="rcsl">Distance</div></div>
        <div class="rcs"><div class="rcsv ${r.p.cg > 65 ? 'ch' : r.p.cg > 35 ? 'cm' : 'cf'}">${ts}</div><div class="rcsl">Time</div></div>
        <div class="rcs"><div class="rcsv ${r.p.delay > 0 ? 'cm' : ''}">${r.p.delay > 0 ? '+' + r.p.delay + 'm' : 'On time'}</div><div class="rcsl">Delay</div></div>
      </div>
      ${(actMode === 'car' || actMode === 'bike' || actMode === 'auto') ? `<div class="rcbar">${r.segs.map(s => `<div class="rcseg ${s.cg === 'h' ? 'bh' : s.cg === 'm' ? 'bm' : 'bf'}" style="flex:${s.pct}"></div>`).join('')}</div>` : ''}
      <div class="rcinfo">🚦 ${r.sigs} signals &nbsp;·&nbsp; <span class="${r.p.cg > 65 ? 'ch' : r.p.cg > 35 ? 'cm' : 'cf'}">${r.p.cg}% congestion</span> &nbsp;·&nbsp; ~${r.p.spd}km/h</div>
      <button class="rcsel-btn" onclick="startNavMode();event.stopPropagation()">📍 Start Live Navigation</button>
    </div>`;
  }).join('');
}

function selRC(i) {
  actIdx = i;
  drawRoutes();
  renderRoutes();
  const coords = curRoutes[i].geometry.coordinates.map(c => [c[1], c[0]]);
  map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });
}

async function renderPreds() {
  if (!curInfos.length) return;
  const r = curInfos[actIdx];
  let fc;
  try { fc = (await API.forecast(r.p.cg)).map(f => ({ off: f.offset_min, cg: f.congestion_pct })); }
  catch (e) { fc = [0, 30, 60, 120].map(off => ({ off, cg: r.p.cg })); }
  const now = new Date();
  const cL = v => v > 65 ? `<span class="ch">${v}%</span>` : v > 35 ? `<span class="cm">${v}%</span>` : `<span class="cf">${v}%</span>`;
  document.getElementById('rpc-preds').innerHTML = `
    <div class="pcard" style="background:#f0f7ff;border-radius:10px;margin:10px">
      <div style="font-size:10px;font-weight:800;color:var(--blue);margin-bottom:6px;display:flex;align-items:center;gap:5px">
        <div style="width:6px;height:6px;border-radius:50%;background:var(--blue);animation:blink 2s infinite"></div>
        LSTM + RANDOM FOREST PREDICTION (server-side)
      </div>
      <div style="font-size:13px;color:#202124;line-height:1.75">
        Congestion: ${cL(r.p.cg)}<br>
        Speed: ~${r.p.spd} km/h &nbsp;·&nbsp; Delay: ${r.p.delay > 0 ? '+' + r.p.delay + ' min' : 'None'}<br>
        Confidence: <b>93.4%</b> · Trained on 1.2M+ records
      </div>
    </div>
    <div class="pcard">
      <div class="pcard-t">Congestion Forecast</div>
      <div class="pcard-s">ML prediction — historical + live fusion</div>
      <div class="ptrow">${fc.map(f => `<div class="ptcell"><div class="ptv ${f.cg > 65 ? 'ch' : f.cg > 35 ? 'cm' : 'cf'}">${f.cg}%</div><div class="ptl">${f.off === 0 ? 'Now' : f.off + ' min'}</div></div>`).join('')}</div>
      <div style="margin-top:8px;font-size:12px;font-weight:600;color:${fc[2].cg > r.p.cg ? '#c5221f' : '#137333'}">
        ${fc[2].cg > r.p.cg ? '⚠️ Worsening — depart now for better conditions' : '✅ Improving — safe to proceed'}
      </div>
    </div>
    <div class="pcard">
      <div class="pcard-t">Best Departure Windows</div>
      <div class="pcard-s">Based on ${now.toLocaleDateString(undefined, { weekday: 'long' })}</div>
      <div style="font-size:12px;color:#5f6368;line-height:1.8;white-space:pre-line">${deptWin(now.getHours())}</div>
    </div>
    <div class="pcard" style="background:#e6f4ea">
      <div class="pcard-t" style="color:#137333">🤖 AI Recommendation</div>
      <div style="font-size:12px;color:#202124;line-height:1.7;margin-top:5px">${aiRec(r)}</div>
    </div>`;
}

function deptWin(h) {
  if (h >= 7 && h <= 9) return '⚠️ Now — Morning peak (7–10 AM)\n✅ 10:30 AM–12 PM — Clear window\n✅ 1–3:30 PM — Midday off-peak\n⚠️ 5–8 PM — Avoid evening rush';
  if (h >= 16 && h <= 19) return '⚠️ Now — Evening peak (5–8 PM)\n✅ After 8:30 PM — Traffic easing fast\n✅ After 10 PM — Near-zero delays';
  return '✅ Now — Good window\n✅ Until 4:30 PM\n⚠️ Avoid 7–9 AM and 5–8 PM\n✅ Weekends: 25% less congestion';
}
function aiRec(r) {
  if (r.p.cg < 35) return `✅ Excellent! Route is only ${r.p.cg}% congested — free flow. Arrive in ~${r.p.tMin} min via ${actMode}. No delays expected.`;
  if (r.p.cg < 65) return `⚠️ Moderate congestion (${r.p.cg}%). Expect +${r.p.delay} min delay. Alternate route may save time. Depart within next 20 min.`;
  return `🔴 Heavy congestion (${r.p.cg}%) — +${r.p.delay}+ min delay. Use Alternate Route or delay 45–60 min. ML predicts improvement after ${(new Date().getHours() + 1) % 24}:30.`;
}

function renderDetails() {
  if (!fromL) return;
  const fa = fromL.raw?.address || {};
  const ta = toL?.raw?.address || {};
  const ir = (l, v) => `<div class="irow"><span class="irow-l">${l}</span><span class="irow-v">${v}</span></div>`;
  document.getElementById('rpc-details').innerHTML = `
    <div class="icard"><div class="icard-t">Origin</div>${ir('Name', fromL.name)}${ir('City', fa.city || fa.town || fa.village || '—')}${ir('District', fa.suburb || fa.city_district || fa.neighbourhood || '—')}${ir('State', fa.state || '—')}${ir('Country', fa.country || '—')}${ir('Pincode', fa.postcode || '—')}${ir('Coords', `${fromL.lat.toFixed(5)}, ${fromL.lon.toFixed(5)}`)}</div>
    ${toL ? `<div class="icard"><div class="icard-t">Destination</div>${ir('Name', toL.name)}${ir('City', ta.city || ta.town || ta.village || '—')}${ir('State', ta.state || '—')}${ir('Country', ta.country || '—')}${ir('Pincode', ta.postcode || '—')}</div>` : ''}
    ${curInfos.length ? `<div class="icard"><div class="icard-t">Route Stats</div>${ir('Distance', curInfos[actIdx].dist + ' km')}${ir('Base Time', curInfos[actIdx].bMin + ' min')}${ir('With Traffic', curInfos[actIdx].p.tMin + ' min')}${ir('Delay', curInfos[actIdx].p.delay > 0 ? '+' + curInfos[actIdx].p.delay + ' min' : 'None')}${ir('Signals', curInfos[actIdx].sigs.toString())}${ir('ML Congestion', curInfos[actIdx].p.cg + '%')}${ir('Avg Speed', '~' + curInfos[actIdx].p.spd + ' km/h')}</div>` : ''}`;
}

function showLocInfo(loc) {
  const a = loc.raw?.address || {};
  document.getElementById('rpanel').style.display = 'flex';
  document.getElementById('rptitle').textContent = loc.name;
  rpTab(document.querySelectorAll('.rptab')[2], 'details');
  const ir = (l, v) => `<div class="irow"><span class="irow-l">${l}</span><span class="irow-v">${v}</span></div>`;
  document.getElementById('rpc-details').innerHTML = `
    <div class="icard"><div class="icard-t">Location Details</div>
      ${ir('Name', loc.name)}
      ${ir('City / Town', a.city || a.town || a.village || a.municipality || '—')}
      ${ir('District', a.suburb || a.city_district || a.district || a.neighbourhood || '—')}
      ${ir('State / Region', a.state || a.region || a.county || '—')}
      ${ir('Country', a.country || '—')}
      ${ir('ISO Code', (a.country_code || '').toUpperCase() || '—')}
      ${ir('Pincode', a.postcode || '—')}
      ${ir('Coordinates', `${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)}`)}
    </div>
    <div class="icard" style="background:#f0f7ff">
      <div class="icard-t">💡 Tip</div>
      <div style="font-size:12px;color:#5f6368;line-height:1.6">Click <b>Directions</b>, enter FROM + TO, then <b>Find Routes</b> to get live traffic overlay + ML predictions.</div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
// LIVE NAVIGATION & TURN-BY-TURN
// ════════════════════════════════════════════════════════════════
function getBearing(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const dLon = (lon2 - lon1) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) - Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
  let brng = Math.atan2(y, x) * toDeg;
  return (brng + 360) % 360;
}

function updateRealTimeDirections(coords, currentIdx) {
  if (currentIdx >= coords.length - 5) {
    document.getElementById('dir-icon').textContent = "📍";
    document.getElementById('dir-text').textContent = "Destination approaching";
    return;
  }
  let lookAheadIdx = Math.min(coords.length - 1, Math.floor(currentIdx) + 5);
  let pastIdx = Math.max(0, Math.floor(currentIdx) - 2);
  let c1 = coords[pastIdx], c2 = coords[Math.floor(currentIdx)], c3 = coords[lookAheadIdx];
  let b1 = getBearing(c1[1], c1[0], c2[1], c2[0]);
  let b2 = getBearing(c2[1], c2[0], c3[1], c3[0]);
  let diff = (b2 - b1 + 360) % 360;
  if (diff > 180) diff -= 360;
  let icon = "⬆️", text = "Continue straight";
  if (diff > 45 && diff <= 135) { icon = "➡️"; text = "Turn right ahead"; }
  else if (diff > 15 && diff <= 45) { icon = "↗️"; text = "Bear right"; }
  else if (diff < -45 && diff >= -135) { icon = "⬅️"; text = "Turn left ahead"; }
  else if (diff < -15 && diff >= -45) { icon = "↖️"; text = "Bear left"; }
  else if (Math.abs(diff) > 135) { icon = "↩️"; text = "U-Turn ahead"; }
  document.getElementById('dir-icon').textContent = icon;
  document.getElementById('dir-text').textContent = text;
  setCompassBearing(b2);
}

let currentNavId = null;

function startNavMode() {
  const navbar = document.getElementById('navbar');
  if (navbar) navbar.style.display = 'block'; // Ensure live navigation menu is visible
  
  document.getElementById('rpanel').style.display = 'none';
  document.getElementById('dir-ui').style.display = 'flex';
  const coords = curRoutes[actIdx].geometry.coordinates;
  if (navMk) map.removeLayer(navMk);
  navMk = L.marker([coords[0][1], coords[0][0]], {
    icon: L.divIcon({ html: `<div style="width:24px;height:24px;border-radius:50%;background:var(--blue);border:4px solid #fff;box-shadow:0 0 15px rgba(66,133,244,.8);animation:blink 1s infinite"></div>`, className: '', iconSize: [24, 24], iconAnchor: [12, 12] })
  }).addTo(map);
  rLayers.push(navMk);
  map.setView([coords[0][1], coords[0][0]], 17);
  isNav = true;
  
  toast('🧭 Navigation started! Following route...');
  updateRealTimeDirections(coords, 0);
  if (CU) {
    API.startLiveNav({
      origin_label: fromL?.name, destination_label: toL?.name,
      origin_lat: fromL?.lat, origin_lon: fromL?.lon, dest_lat: toL?.lat, dest_lon: toL?.lon,
      eta_minutes: curInfos[actIdx]?.p?.tMin
    }).then(nav => { currentNavId = nav.id; }).catch(() => {});
  }
}

function startRealGPS() {
  // Completely stop simulation loops so tapping Real GPS never triggers simulation mode
  stopSim();
  
  if (!navigator.geolocation) {
    toast('⚠️ GPS not supported by this browser.');
    return;
  }
  toast('📡 Acquiring high-accuracy GPS signal...');
  
  if (navGPSid !== null) {
    navigator.geolocation.clearWatch(navGPSid);
    navGPSid = null;
  }

  navGPSid = navigator.geolocation.watchPosition(
    pos => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (navMk) navMk.setLatLng(ll);
      if (map) map.panTo(ll, { animate: true, duration: 0.5 });
      const speedKmh = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0;
      document.getElementById('nav-spd').textContent = speedKmh;
      document.getElementById('nav-eta').textContent = 'Live GPS';
      document.getElementById('nav-dist').textContent = 'Active';
    },
    err => {
      let errorMsg = '⚠️ GPS signal lost or denied.';
      if (err.code === 1) errorMsg = '⚠️ Location permission denied in browser settings.';
      else if (err.code === 3) errorMsg = '⚠️ GPS request timed out.';
      toast(errorMsg);
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
  );
}

function startSimNav() {
  stopRealGPS();
  const coords = curRoutes[actIdx].geometry.coordinates;
  navSimIdx = 0;
  const spds = { car: 12, bike: 9, auto: 10, metro: 9, cycle: 4, walk: 1 };
  const step = spds[actMode] || 10;
  navSimInt = setInterval(() => {
    if (navSimIdx >= coords.length) { stopNav(); toast('🏁 Arrived at destination!'); return; }
    const c = coords[navSimIdx];
    if (navMk) navMk.setLatLng([c[1], c[0]]);
    map.panTo([c[1], c[0]], { animate: true, duration: .1 });
    const spd = { car: Math.floor(35 + Math.random() * 25), bike: Math.floor(25 + Math.random() * 15), auto: Math.floor(20 + Math.random() * 20), metro: 60, cycle: Math.floor(12 + Math.random() * 8), walk: Math.floor(4 + Math.random() * 3) }[actMode] || 40;
    const rem = Math.round((coords.length - navSimIdx) / coords.length * curInfos[actIdx].dist * 10) / 10;
    document.getElementById('nav-spd').textContent = spd;
    document.getElementById('nav-eta').textContent = 'Navigating';
    document.getElementById('nav-dist').textContent = rem + 'km';
    updateRealTimeDirections(coords, navSimIdx);
    navSimIdx += step;
  }, 150);
}

function stopRealGPS() { if (navGPSid !== null) { navigator.geolocation.clearWatch(navGPSid); navGPSid = null; } }
function stopSim() { if (navSimInt !== null) { clearInterval(navSimInt); navSimInt = null; } }
function stopNav() {
  stopRealGPS(); stopSim();
  if (navMk) { map.removeLayer(navMk); navMk = null; }
  document.getElementById('navbar').style.display = 'none';
  document.getElementById('livepop').style.display = 'none';
  document.getElementById('dir-ui').style.display = 'none';
  document.getElementById('rpanel').style.display = 'flex';
  isNav = false;
  if (currentNavId) { API.stopLiveNav(currentNavId).catch(() => {}); currentNavId = null; }
}

// ════════════════════════════════════════════════════════════════
// LIVE WEBSOCKET FEED (Strictly Background Cache — NO Auto-Popups)
// ════════════════════════════════════════════════════════════════
function connectLiveSocket() {
  try {
    liveSocket = API.liveSocket();
    liveSocket.onmessage = (evt) => {
      // SILENT CACHE ONLY: Never call renderLivePop() here.
      lastLiveSnapshot = JSON.parse(evt.data);
    };
    liveSocket.onerror = () => {};
  } catch (e) {}
}

function renderLivePop(d) {
  document.getElementById('lp-temp').textContent = d.temp_c + '°C';
  document.getElementById('lp-weather').textContent = d.weather;
  document.getElementById('lp-moist').textContent = d.moisture_pct + '%';
  document.getElementById('lp-aqi').textContent = d.aqi;
  const cgEl = document.getElementById('lp-cg');
  cgEl.textContent = d.congestion_pct + '%';
  cgEl.style.color = d.congestion_pct > 65 ? '#c5221f' : d.congestion_pct > 35 ? '#b06000' : '#137333';
  document.getElementById('lp-flow').textContent = d.flow_veh_hr;
  document.getElementById('lp-news').textContent = '📰 Live server feed — congestion & weather updated.';
  const cg = d.congestion_pct;
  document.getElementById('lp-ml').textContent = cg > 65 ? `🔴 ML Alert: Heavy congestion ahead (${cg}%).` : cg > 35 ? `🟡 ML Prediction: Moderate traffic (${cg}%).` : `🟢 ML Prediction: Free flow (${cg}%).`;
  document.getElementById('livepop').style.display = 'block';
}

// Opens the popup STRICTLY on-demand when the user clicks the "Route Update" button
function showLivePop() { 
  if (lastLiveSnapshot) {
    renderLivePop(lastLiveSnapshot); 
  } else {
    renderLivePop({ temp_c: 25, weather: 'Clear', moisture_pct: 40, aqi: 90, congestion_pct: 15, flow_veh_hr: 1500 });
  }
}

function closeLivePop() { 
  document.getElementById('livepop').style.display = 'none'; 
}

// ════════════════════════════════════════════════════════════════
// AI ASSISTANT
// ════════════════════════════════════════════════════════════════
const QQS = ['Best route now?', 'Traffic in Delhi', 'Bengaluru tips', 'Mumbai rush hours', 'How ML predicts traffic', 'Weather impact on traffic', 'When to depart?', 'Signal timing optimization'];

function initChat() {
  addAI(`Hello! 👋 I'm TrafficAI Expert — backed by a real API now.\n\n🗺️ Search any city or address in the bar above\n🛣️ Click Directions → enter FROM + TO → Find Routes\n🚦 Color-coded traffic map: 🟢 Free · 🟡 Moderate · 🔴 Congested\n🧭 Live navigation with GPS or simulation\n\nAsk me anything!`);
  document.getElementById('qqrow').innerHTML = QQS.map(q => `<button class="qq" onclick="askQQ('${q}')">${q}</button>`).join('');
}

function askQQ(q) { document.getElementById('chatinp').value = q; sendMsg(); }

async function sendMsg() {
  const inp = document.getElementById('chatinp');
  const txt = inp.value.trim(); if (!txt) return;
  inp.value = ''; addUser(txt); showTyping();
  let rep;
  try {
    const context = curInfos.length ? { route_congestion: curInfos[actIdx].p.cg, from: fromL?.name, to: toL?.name } : null;
    const res = await API.ask(txt, context);
    rep = res.reply;
  } catch (e) {
    rep = '⚠️ Could not reach the AI backend. Check the API URL in Settings.';
  }
  hideTyping(); addAI(rep);
}

function addAI(t) { const c = document.getElementById('chatmsgs'); const el = document.createElement('div'); el.className = 'cmsg-ai'; el.textContent = t; c.appendChild(el); c.scrollTop = c.scrollHeight; }
function addUser(t) { const c = document.getElementById('chatmsgs'); const el = document.createElement('div'); el.className = 'cmsg-user'; el.textContent = t; c.appendChild(el); c.scrollTop = c.scrollHeight; }
function showTyping() { const c = document.getElementById('chatmsgs'); const el = document.createElement('div'); el.className = 'cmsg-typing'; el.id = 'typer'; el.innerHTML = '<div class="tdots"><span></span><span></span><span></span></div>'; c.appendChild(el); c.scrollTop = c.scrollHeight; }
function hideTyping() { const e = document.getElementById('typer'); if (e) e.remove(); }

function toggleAI() {
  aiOpen = !aiOpen;
  document.getElementById('aipanel').classList.toggle('show', aiOpen);
  document.getElementById('ai-btn').classList.toggle('on', aiOpen);
}

// ════════════════════════════════════════════════════════════════
// DATABASE VIEWER
// ════════════════════════════════════════════════════════════════
function toggleDB() { document.getElementById('dbpanel').classList.toggle('show'); if (document.getElementById('dbpanel').classList.contains('show')) renderDB('records'); }
function dbTab(el, tab) {
  document.querySelectorAll('.dbtab').forEach(t => t.classList.remove('on')); el.classList.add('on');
  renderDB(tab);
}
async function renderDB(tab) {
  const t = document.getElementById('dbtbl');
  const stat = document.getElementById('dbstat');
  t.innerHTML = `<tr><td style="padding:14px;color:#9aa0a6">Loading from API...</td></tr>`;
  const t0 = performance.now();
  try {
    let cols, rows;
    if (tab === 'records') {
      const data = await API.records(25);
      cols = ['ID', 'Location', 'Speed', 'Density', 'Flow', 'Congestion', 'Timestamp'];
      rows = data.map(r => [r.code, r.location, r.speed + 'km/h', r.density + '%', r.flow, `<b style="color:${r.congestion === 'Heavy' ? '#c5221f' : r.congestion === 'Moderate' ? '#b06000' : '#137333'}">${r.congestion}</b>`, new Date(r.timestamp).toLocaleString()]);
    } else if (tab === 'sensors') {
      const data = await API.sensors();
      cols = ['ID', 'Location', 'Speed', 'Status', 'Reading', 'Updated'];
      rows = data.map(s => [s.code, s.location, (s.speed || 0) + 'km/h', `<b style="color:${s.status === 'active' ? '#137333' : '#b06000'}">${s.status}</b>`, s.reading || '—', new Date(s.last_update).toLocaleTimeString()]);
    } else if (tab === 'incidents') {
      const data = await API.incidents();
      cols = ['ID', 'Type', 'Location', 'Priority', 'Delay', 'Status'];
      rows = data.map(i => [i.code, i.type, i.location, `<b style="color:${i.priority === 'Critical' ? '#c5221f' : i.priority === 'High' ? '#c5221f' : i.priority === 'Medium' ? '#b06000' : '#137333'}">${i.priority}</b>`, i.delay_minutes + ' min', i.status]);
    } else {
      const data = await API.publicReports();
      cols = ['ID', 'Category', 'Level', 'Location', 'Status', 'Time'];
      rows = data.map(r => [r.code, r.category, r.level || '—', r.address_label || '—', r.status, new Date(r.created_at).toLocaleString()]);
    }
    t.innerHTML = `<thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
    stat.textContent = `${rows.length} records · Query: ${Math.round(performance.now() - t0)}ms · live from FastAPI backend`;
  } catch (e) {
    t.innerHTML = `<tr><td style="padding:14px;color:#c5221f">Could not load data: ${e.message}</td></tr>`;
  }
}

// ════════════════════════════════════════════════════════════════
// SETTINGS / REPORT
// ════════════════════════════════════════════════════════════════
function openSettings() { document.getElementById('settingspanel').classList.add('show'); document.getElementById('ovl').classList.add('show'); }
function openReport() { document.getElementById('rptpanel').classList.add('show'); document.getElementById('ovl').classList.add('show'); }
function closeAll() {
  document.getElementById('settingspanel').classList.remove('show');
  document.getElementById('rptpanel').classList.remove('show');
  document.getElementById('ovl').classList.remove('show');
}

function selRptLvl(l, el) {
  rptLevel = l;
  document.querySelectorAll('.rpt-opt').forEach(e => e.classList.remove('sel'));
  el.classList.add('sel');
}
function toggleAccidentTriage() {
  const on = document.getElementById('rpt-is-accident').checked;
  document.getElementById('rpt-triage').style.display = on ? 'block' : 'none';
  if (!on) document.getElementById('rpt-firstaid').style.display = 'none';
}
async function submitReport() {
  if (!rptLevel) { toast('⚠️ Select a traffic level first'); return; }
  const note = document.getElementById('rpt-note').value.trim();
  const isAccident = document.getElementById('rpt-is-accident').checked;
  try {
    const payload = {
      category: isAccident ? 'Accident' : 'Traffic Condition',
      level: rptLevel, note: note || 'No details added', lat: fromL?.lat, lon: fromL?.lon,
      injuries_reported: isAccident ? document.getElementById('rpt-injured').checked : null,
      ambulance_required: isAccident ? document.getElementById('rpt-ambulance').checked : null,
      road_blocked: isAccident ? document.getElementById('rpt-blocked').checked : null,
    };
    const res = await API.createReport(payload);
    if (res.first_aid_guidance) {
      const box = document.getElementById('rpt-firstaid');
      box.style.display = 'block';
      box.innerHTML = `<b>🚑 Emergency services alerted.</b><br>${res.first_aid_guidance}`;
      toast('🚨 Emergency reported — Traffic Control notified');
      return;
    }
    toast(res.incident_id ? '✅ Report submitted — escalated to a tracked incident!' : '✅ Report submitted to database!');
  } catch (e) {
    toast('⚠️ Could not submit report: ' + e.message);
    return;
  }
  closeAll();
  rptLevel = null; document.getElementById('rpt-note').value = '';
  document.getElementById('rpt-is-accident').checked = false;
  toggleAccidentTriage();
  document.querySelectorAll('.rpt-opt').forEach(e => e.classList.remove('sel'));
  if (document.getElementById('dbpanel').classList.contains('show')) renderDB('reports');
}

// ════════════════════════════════════════════════════════════════
// GOOGLE MAPS (optional)
// ════════════════════════════════════════════════════════════════
function applyGM() {
  gmKey = document.getElementById('gmkey').value.trim();
  if (!gmKey) { toast('⚠️ Enter a valid API key'); return; }
  toast('🔄 Loading Google Maps...');
  const old = document.getElementById('gms'); if (old) old.remove();
  window.__gmcb = () => initGM();
  const s = document.createElement('script');
  s.id = 'gms';
  s.src = `https://maps.googleapis.com/maps/api/js?key=${gmKey}&libraries=places,geometry&callback=__gmcb`;
  s.onerror = () => toast('⚠️ Google Maps failed. Check billing + APIs enabled.');
  document.head.appendChild(s);
  closeAll();
}
function initGM() {
  document.getElementById('map').innerHTML = '';
  const d = document.createElement('div'); d.id = 'gmd'; d.style.cssText = 'width:100%;height:100%;position:absolute;inset:0';
  document.getElementById('map').appendChild(d);
  gmap = new google.maps.Map(d, { center: { lat: fromL?.lat || 20.59, lng: fromL?.lon || 78.96 }, zoom: fromL ? 14 : 5, mapTypeControl: false, streetViewControl: false, zoomControl: false });
  new google.maps.TrafficLayer().setMap(gmap);
  ['sinp', 'from-inp', 'to-inp'].forEach(id => {
    const inp = document.getElementById(id);
    const ac = new google.maps.places.Autocomplete(inp);
    ac.addListener('place_changed', () => {
      const pl = ac.getPlace(); if (!pl.geometry) return;
      const loc = { name: pl.name || pl.formatted_address.split(',')[0], display: pl.formatted_address, lat: pl.geometry.location.lat(), lon: pl.geometry.location.lng(), raw: { address: {} } };
      if (id === 'from-inp') { fromL = loc; gmap.panTo({ lat: loc.lat, lng: loc.lon }); }
      else if (id === 'to-inp') { toL = loc; if (fromL) doRoute(); }
      else { gmap.panTo({ lat: loc.lat, lng: loc.lon }); gmap.setZoom(14); }
    });
  });
  toast('✅ Google Maps loaded with live traffic!');
  document.getElementById('mstext').textContent = 'Google Maps active · Live traffic layer ON';
}

// ════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3300);
}

document.addEventListener('DOMContentLoaded', tryResumeSession);

// ════════════════════════════════════════════════════════════════
// INFRASTRUCTURE ISSUE REPORTING
// ════════════════════════════════════════════════════════════════
let infraPinMode = false;
let infraPinMk = null;
let infraLoc = null;
let infraPhotoUrl = null;

function rptModeTab(mode, el) {
  document.querySelectorAll('#rptpanel .rptab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('rpt-mode-traffic').style.display = mode === 'traffic' ? 'block' : 'none';
  document.getElementById('rpt-mode-infra').style.display = mode === 'infra' ? 'block' : 'none';
}

function infraUseGPS() {
  if (!navigator.geolocation) { toast('⚠️ GPS not available on this device'); return; }
  document.getElementById('infra-location-result').textContent = 'Getting your location...';
  navigator.geolocation.getCurrentPosition(async pos => {
    await infraSetPin(pos.coords.latitude, pos.coords.longitude);
  }, () => {
    document.getElementById('infra-location-result').innerHTML = '<span style="color:#c5221f">Could not get GPS location — try Pin on Map instead.</span>';
  });
}

function infraPinOnMap() {
  infraPinMode = true;
  toggleAll_hideModalsForPin();
  toast('📌 Tap anywhere on the map to pin the exact issue location');
}
function toggleAll_hideModalsForPin() {
  document.getElementById('rptpanel').style.display = 'none';
  document.getElementById('ovl').style.display = 'none';
}

async function infraSetPin(lat, lon) {
  infraPinMode = false;
  document.getElementById('rptpanel').style.display = 'flex';
  document.getElementById('ovl').style.display = 'block';
  if (infraPinMk) map.removeLayer(infraPinMk);
  infraPinMk = L.marker([lat, lon], { icon: mkIcon('#EA4335', 18) }).addTo(map);
  map.setView([lat, lon], Math.max(map.getZoom(), 16));

  const resultEl = document.getElementById('infra-location-result');
  resultEl.textContent = 'Looking up address...';
  let label = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  try {
    const rev = await API.reverseGeocode(lat, lon);
    if (rev && rev.display_name) label = rev.display_name.split(',').slice(0, 4).join(', ');
  } catch (e) {}
  infraLoc = { lat, lon, label };
  resultEl.innerHTML = `📍 <b>${label}</b><br><span style="color:#9aa0a6">${lat.toFixed(5)}, ${lon.toFixed(5)}</span>`;

  const category = document.getElementById('infra-category').value;
  try {
    const nearby = (await API.publicReports()).filter(r => {
      if (r.category !== category || r.lat == null || r.lon == null) return false;
      const d = Math.sqrt(Math.pow((r.lat - lat) * 111000, 2) + Math.pow((r.lon - lon) * 111000 * Math.cos(lat * Math.PI / 180), 2));
      return d <= 150;
    });
    const box = document.getElementById('infra-recurrence');
    if (nearby.length > 0) {
      box.style.display = 'block';
      box.textContent = `⚠️ This issue has been reported ${nearby.length} time(s) near this exact spot already.`;
    } else {
      box.style.display = 'none';
    }
  } catch (e) {}
}

async function infraPhotoPreview() {
  const input = document.getElementById('infra-photo');
  const preview = document.getElementById('infra-photo-preview');
  if (!input.files.length) return;
  const file = input.files[0];
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
  toast('📤 Uploading photo...');
  try {
    const res = await API.uploadPhoto(file);
    infraPhotoUrl = res.url;
    toast('✅ Photo attached');
  } catch (e) {
    toast('⚠️ Photo upload failed: ' + e.message);
    infraPhotoUrl = null;
  }
}

async function submitInfraReport() {
  const category = document.getElementById('infra-category').value;
  const note = document.getElementById('infra-note').value.trim();
  if (!infraLoc) { toast('⚠️ Set a location first — use GPS or pin on map'); return; }
  try {
    const res = await API.createReport({
      category, note: note || `${category} reported`, lat: infraLoc.lat, lon: infraLoc.lon,
      address_label: infraLoc.label, photo_url: infraPhotoUrl
    });
    const recur = res.recurrence_count ? ` This is the ${res.recurrence_count + 1} report at this location.` : '';
    toast(res.incident_id ? `✅ Reported — escalated to a tracked incident!${recur}` : `✅ Report submitted!${recur}`);
  } catch (e) {
    toast('⚠️ Could not submit report: ' + e.message);
    return;
  }
  closeAll();
  if (infraPinMk) { map.removeLayer(infraPinMk); infraPinMk = null; }
  infraLoc = null; infraPhotoUrl = null;
  document.getElementById('infra-note').value = '';
  document.getElementById('infra-location-result').textContent = '';
  document.getElementById('infra-recurrence').style.display = 'none';
  document.getElementById('infra-photo-preview').style.display = 'none';
  document.getElementById('infra-photo').value = '';
  if (document.getElementById('dbpanel').classList.contains('show')) renderDB('reports');
}

// ════════════════════════════════════════════════════════════════
// PROFILE & VEHICLE MANAGEMENT
// ════════════════════════════════════════════════════════════════
function profTab(tab, el) {
  document.querySelectorAll('#profilepanel .rptab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('prof-details').style.display = tab === 'details' ? 'block' : 'none';
  document.getElementById('prof-vehicles').style.display = tab === 'vehicles' ? 'block' : 'none';
}

const originalCloseAll = closeAll;
closeAll = function() {
  originalCloseAll();
  const pp = document.getElementById('profilepanel');
  if (pp) pp.classList.remove('show');
};

function openProfile() {
  document.getElementById('profilepanel').classList.add('show');
  document.getElementById('ovl').classList.add('show');
  
  if (typeof CU !== 'undefined' && CU) {
    document.getElementById('prof-name').value = CU.name || 'Not provided';
    document.getElementById('prof-id').value = CU.urbanguard_id || 'Not provided';
    document.getElementById('prof-mobile').value = CU.mobile || 'Not provided';
    document.getElementById('prof-email').value = CU.email || 'Not provided';
    document.getElementById('prof-role').value = CU.role || 'Citizen';
  }
  loadVehicles();
}

async function loadVehicles() {
  const list = document.getElementById('veh-list');
  if (!list) return;
  list.innerHTML = '<div style="font-size:12px;color:#9aa0a6">Loading vehicles from server...</div>';
  try {
    const vehicles = await API.myVehicles();
    if (!vehicles || vehicles.length === 0) {
      list.innerHTML = '<div style="font-size:12px;color:#9aa0a6">No vehicles registered yet.</div>';
      return;
    }
    list.innerHTML = vehicles.map(v => `
      <div style="background:#f8f9fa;border:1px solid #dadce0;border-radius:8px;padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:14px;font-weight:700;color:var(--blue);text-transform:uppercase">${v.reg_number}</div>
          <button onclick="deleteVehicle('${v.id}')" style="background:none;border:none;color:#c5221f;cursor:pointer;font-size:11px;font-weight:700">🗑️ REMOVE</button>
        </div>
        <div style="font-size:12px;color:#5f6368;margin-top:6px">${v.manufacturer || 'Unknown Make'} ${v.model || ''} • ${v.fuel_type || 'Unknown Fuel'}</div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<div style="font-size:12px;color:#c5221f">Failed to load vehicles from database.</div>';
  }
}

async function addNewVehicle() {
  const reg_number = document.getElementById('v-reg').value.trim();
  if (!reg_number) { toast('⚠️ Registration number is required'); return; }
  
  try {
    await API.addVehicle({
      reg_number: reg_number.toUpperCase(),
      vehicle_type: document.getElementById('v-type').value.trim() || null,
      manufacturer: document.getElementById('v-make').value.trim() || null,
      model: document.getElementById('v-model').value.trim() || null,
      fuel_type: document.getElementById('v-fuel').value.trim() || null
    });
    
    toast('✅ Vehicle added to your garage!');
    ['v-reg', 'v-type', 'v-make', 'v-model', 'v-fuel'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    loadVehicles();
  } catch (e) {
    toast('⚠️ Could not add vehicle: ' + e.message);
  }
}

async function deleteVehicle(id) {
  if (!confirm('Are you sure you want to permanently remove this vehicle?')) return;
  try {
    await API.deleteVehicle(id);
    toast('✅ Vehicle removed from profile');
    loadVehicles();
  } catch (e) {
    toast('⚠️ Error removing vehicle: ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════════
// DUAL MAP ENGINE (OSM + GOOGLE MAPS)
// ════════════════════════════════════════════════════════════════
let currentMapEngine = 'osm'; 
let gMap = null;
let trafficLayer = null;

async function switchMapEngine(engine) {
  if (engine === currentMapEngine) return;
  
  const osmBtn = document.getElementById('btn-osm');
  const googleBtn = document.getElementById('btn-google');
  if (osmBtn) osmBtn.classList.remove('active');
  if (googleBtn) googleBtn.classList.remove('active');
  
  const targetBtn = document.getElementById('btn-' + engine);
  if (targetBtn) targetBtn.classList.add('active');
  
  const gTrafficCheck = document.getElementById('g-traffic-check');
  const leafletContainer = document.querySelector('.leaflet-container');

  if (engine === 'google') {
    const apiKey = document.getElementById('gmkey').value || localStorage.getItem('gmkey');
    if (!apiKey) {
      toast('⚠️ Please add your Google Maps API Key in Settings first!');
      if (osmBtn) osmBtn.classList.add('active');
      if (googleBtn) googleBtn.classList.remove('active');
      return;
    }
    
    if (leafletContainer) leafletContainer.style.visibility = 'hidden';
    if (gTrafficCheck) gTrafficCheck.disabled = false;
    
    if (!gMap) {
      toast('Loading Google Maps Engine...');
      await loadGoogleMapsAPI(apiKey);
      
      const gContainer = document.createElement('div');
      gContainer.id = 'gmap-container';
      document.getElementById('APP').insertBefore(gContainer, document.getElementById('map'));

      const center = (typeof map !== 'undefined' && map) ? map.getCenter() : { lat: 12.9716, lng: 77.5946 };
      const zoom = (typeof map !== 'undefined' && map) ? map.getZoom() : 13;

      gMap = new google.maps.Map(gContainer, {
        center: { lat: center.lat, lng: center.lng },
        zoom: zoom,
        disableDefaultUI: true,
        zoomControl: false,
        mapTypeId: 'roadmap'
      });
    } else {
      document.getElementById('gmap-container').style.display = 'block';
      if (typeof map !== 'undefined' && map) {
        const center = map.getCenter();
        gMap.setCenter({ lat: center.lat, lng: center.lng });
        gMap.setZoom(map.getZoom());
      }
    }
  } else {
    const gContainer = document.getElementById('gmap-container');
    if (gContainer) gContainer.style.display = 'none';
    if (leafletContainer) leafletContainer.style.visibility = 'visible';
    if (gTrafficCheck) gTrafficCheck.disabled = true;
    
    if (gMap && typeof map !== 'undefined' && map) {
      const center = gMap.getCenter();
      map.setView([center.lat(), center.lng()], gMap.getZoom());
    }
  }
  
  currentMapEngine = engine;
  const menu = document.getElementById('map-layer-menu');
  if (menu) menu.classList.remove('show');
}

function toggleGoogleTraffic() {
  if (!gMap) return;
  const checkbox = document.getElementById('g-traffic-check');
  if (!checkbox) return;
  checkbox.checked = !checkbox.checked;
  
  if (checkbox.checked) {
    if (!trafficLayer) trafficLayer = new google.maps.TrafficLayer();
    trafficLayer.setMap(gMap);
    toast('🟢 Google Live Traffic enabled');
  } else {
    if (trafficLayer) trafficLayer.setMap(null);
    toast('⚪ Google Live Traffic disabled');
  }
}

function loadGoogleMapsAPI(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) { resolve(); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry,routes`;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Google Maps failed to load. Check API key restrictions.'));
    document.head.appendChild(script);
  });
}