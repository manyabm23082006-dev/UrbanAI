// ════════════════════════════════════════════════════════════════
// OPS DASHBOARDS — full-screen, role-tinted command centers for
// Traffic Police, Municipality, and Super Admin (Phases 15/20/26).
// Every number on screen comes from a real backend call (see js/api.js);
// nothing here is fabricated. All endpoints are already role-gated
// server-side (see backend/app/api/deps.py) — this file only decides
// what to *render*, never what a role is *allowed* to see.
// ════════════════════════════════════════════════════════════════

const OPS = {
  kind: null,       // 'police' | 'muni' | 'admin'
  section: null,
  user: null,
};

const OPS_CONFIG = {
  police: {
    eyebrow: 'Traffic Police',
    title: 'Command Center',
    sub: 'Operational · real-time · map-heavy',
    nav: [
      { id: 'overview', icon: '📊', label: 'Overview' },
      { id: 'verify', icon: '🔍', label: 'Vehicle Verification' },
      { id: 'flagged', icon: '🚩', label: 'Flagged Vehicles' },
      { id: 'violations', icon: '🎫', label: 'Violations & Challans' },
      { id: 'reports', icon: '🛣️', label: 'Traffic & Infra Reports' },
      { id: 'sensors', icon: '📡', label: 'IoT Sensors' },
    ],
  },
  muni: {
    eyebrow: 'Municipality',
    title: 'Command Center',
    sub: 'Infrastructure · work orders · budget',
    nav: [
      { id: 'overview', icon: '📊', label: 'Overview' },
      { id: 'queue', icon: '🏗️', label: 'Infrastructure Queue' },
      { id: 'budget', icon: '💰', label: 'Budget & Workforce' },
      { id: 'wards', icon: '🗺️', label: 'Ward Health' },
      { id: 'reports', icon: '📥', label: 'Citizen Reports' },
    ],
  },
  admin: {
    eyebrow: 'Super Admin',
    title: 'City Command',
    sub: 'City-wide · analytical · data-rich',
    nav: [
      { id: 'overview', icon: '📊', label: 'Overview' },
      { id: 'cityhealth', icon: '🏙️', label: 'City Health Index' },
      { id: 'wards', icon: '🗺️', label: 'Ward Comparison' },
      { id: 'analytics', icon: '📈', label: 'Analytics' },
      { id: 'enforcement', icon: '🚓', label: 'Enforcement' },
      { id: 'sensors', icon: '📡', label: 'IoT Sensors' },
      { id: 'reports', icon: '📥', label: 'All Reports' },
    ],
  },
};

function initOps(kind, user) {
  OPS.kind = kind;
  OPS.user = user;
  const cfg = OPS_CONFIG[kind];
  const shell = document.getElementById('OPS');
  shell.className = 'show ops-' + kind;

  document.getElementById('ops-eyebrow').textContent = cfg.eyebrow;
  document.getElementById('ops-title').textContent = cfg.title;
  document.getElementById('ops-sub').textContent = cfg.sub;
  document.getElementById('ops-uname').textContent = user.name;
  document.getElementById('ops-urole').textContent = user.role;
  document.getElementById('ops-av').textContent = (user.name || '?').trim().charAt(0).toUpperCase();

  document.getElementById('ops-nav').innerHTML = cfg.nav.map(n =>
    `<div class="ops-nav-item" id="ops-nav-${n.id}" onclick="opsGo('${n.id}')">
       <span class="ops-nav-icon">${n.icon}</span>${n.label}
     </div>`).join('');

  opsTickClock();
  if (!OPS._clockTimer) OPS._clockTimer = setInterval(opsTickClock, 1000);

  opsGo(cfg.nav[0].id);
}

function opsTickClock() {
  const el = document.getElementById('ops-clock');
  if (el) el.textContent = new Date().toLocaleTimeString();
}

function opsGo(sectionId) {
  OPS.section = sectionId;
  document.querySelectorAll('.ops-nav-item').forEach(el => el.classList.remove('on'));
  const navEl = document.getElementById('ops-nav-' + sectionId);
  if (navEl) navEl.classList.add('on');
  const cfg = OPS_CONFIG[OPS.kind];
  const navItem = cfg.nav.find(n => n.id === sectionId);
  document.getElementById('ops-section-title').textContent = navItem ? navItem.label : '';
  document.getElementById('ops-sidebar').classList.remove('show'); // close mobile drawer
  const body = document.getElementById('ops-body');
  body.innerHTML = `<div class="ops-loading">Loading ${navItem ? navItem.label.toLowerCase() : ''}…</div>`;

  const renderer = OPS_RENDERERS[OPS.kind] && OPS_RENDERERS[OPS.kind][sectionId];
  if (renderer) renderer(body);
  else body.innerHTML = `<div class="ops-err">No view registered for "${sectionId}".</div>`;
}

// ── shared render helpers ─────────────────────────────────────────
function opsErr(body, e) {
  body.innerHTML = `<div class="ops-err">Could not load this view: ${(e && e.message) || e}</div>`;
}
function opsKpi(val, lbl, sub) {
  return `<div class="ops-kpi"><div class="ops-kpi-val">${val}</div><div class="ops-kpi-lbl">${lbl}</div>${sub ? `<div class="ops-kpi-sub">${sub}</div>` : ''}</div>`;
}
function opsBadge(text, tone) {
  return `<span class="ops-badge ops-badge-${tone}">${text}</span>`;
}
function opsDocTone(status) {
  if (status === 'Expired') return 'red';
  if (status === 'Expiring Soon') return 'yellow';
  if (status === 'Valid') return 'green';
  return 'grey';
}
function opsSevTone(sev) {
  const s = (sev || '').toLowerCase();
  if (s === 'critical' || s === 'high') return 'red';
  if (s === 'moderate' || s === 'medium') return 'yellow';
  if (s === 'low') return 'green';
  return 'grey';
}
function opsTable(headers, rows) {
  if (!rows.length) return `<div class="ops-empty">Nothing here right now.</div>`;
  return `<div class="ops-table-wrap"><table class="ops-table">
    <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}
function opsPanel(title, note, innerHtml) {
  return `<div class="ops-panel">
    <div class="ops-panel-hdr"><div class="ops-panel-title">${title}</div>${note ? `<div class="ops-panel-note">${note}</div>` : ''}</div>
    ${innerHtml}
  </div>`;
}
function opsTimeAgo(iso) {
  if (!iso) return '—';
  const d = new Date(iso), diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`;
  return d.toLocaleDateString();
}

// ════════════════════════════════════════════════════════════════
// POLICE
// ════════════════════════════════════════════════════════════════
async function opsPoliceOverview(body) {
  try {
    const [flagged, violations, reports, sensors] = await Promise.all([
      API.flaggedVehicles(), API.violations(), API.reports(), API.sensors(),
    ]);
    const unpaid = violations.filter(v => v.challan && v.challan.status === 'Unpaid').length;
    const openReports = reports.filter(r => r.status && r.status !== 'Completed' && r.status !== 'Resolved').length;
    const activeSensors = sensors.filter(s => s.status === 'active').length;
    body.innerHTML = `
      <div class="ops-section-title">Today at a glance</div>
      <div class="ops-kpis">
        ${opsKpi(flagged.length, 'Flagged Vehicles', 'Expired / expiring docs')}
        ${opsKpi(violations.length, 'Violations Recorded', unpaid + ' unpaid challans')}
        ${opsKpi(openReports, 'Open Road/Infra Reports', 'awaiting resolution')}
        ${opsKpi(activeSensors + '/' + sensors.length, 'Sensors Active', 'IoT network health')}
      </div>
      <div class="ops-section-title">Recent Violations</div>
      ${opsPanel('Latest 6', '', opsTable(
        ['Code', 'Vehicle', 'Type', 'Location', 'Status', 'When'],
        violations.slice(0, 6).map(v => [
          v.code, v.reg_number_text || '—', v.violation_type, v.location || '—',
          v.challan ? opsBadge(v.challan.status, v.challan.status === 'Paid' ? 'green' : 'red') : opsBadge('No challan', 'grey'),
          opsTimeAgo(v.created_at),
        ])
      ))}
      <div class="ops-section-title">Highest-Priority Reports</div>
      ${opsPanel('Sorted by AI priority', '', opsTable(
        ['Code', 'Category', 'Level', 'Status', 'Reported'],
        reports.slice(0, 6).map(r => [
          r.code, r.category, r.level ? opsBadge(r.level, opsSevTone(r.level)) : '—',
          opsBadge(r.status, r.status === 'Completed' || r.status === 'Resolved' ? 'green' : 'blue'),
          opsTimeAgo(r.created_at),
        ])
      ))}`;
  } catch (e) { opsErr(body, e); }
}

function opsPoliceVerify(body) {
  body.innerHTML = `
    ${opsPanel('ANPR-style Vehicle Lookup & Citizen Documents', 'Enter a registration number to inspect full records and files', `
      <div style="display:flex;gap:8px;max-width:420px">
        <input class="ops-input" id="ops-verify-reg" placeholder="e.g. KA-01-AB-1234" onkeydown="if(event.key==='Enter')opsVerifyLookup()">
        <button class="ops-btn" style="flex-shrink:0" onclick="opsVerifyLookup()">Lookup</button>
      </div>
    `)}
    <div id="ops-verify-result"></div>`;
}

async function opsVerifyLookup() {
  const reg = document.getElementById('ops-verify-reg').value.trim();
  const resultEl = document.getElementById('ops-verify-result');
  if (!reg) { return; }
  resultEl.innerHTML = `<div class="ops-loading">Looking up ${reg}…</div>`;
  try {
    const r = await API.lookupVehicle(reg);
    if (!r.found) { resultEl.innerHTML = `<div class="ops-err">No vehicle found for "${reg}".</div>`; return; }
    
    // Explicitly render document metadata and secure file preview links for staff/police review
    const docsHtml = r.documents && r.documents.length ? r.documents.map(d => `
      <div style="background:rgba(255,255,255,0.03);padding:10px;margin-top:6px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center">
        <div>
          <b style="color:var(--text)">${d.doc_type}</b> <span style="font-size:11px;color:var(--text2)">(#${d.doc_number || 'N/A'})</span><br>
          <span style="font-size:11px;font-weight:700">${opsBadge(d.status, opsDocTone(d.status))}</span>
          ${d.expires_on ? `<span style="font-size:10px;color:var(--text2)"> · Expires: ${new Date(d.expires_on).toLocaleDateString()}</span>` : ''}
        </div>
        ${d.file_url ? `<a href="${API.getBase()}${d.file_url}" target="_blank" style="background:var(--blue);color:#fff;padding:5px 12px;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none">🔍 View File</a>` : '<span style="font-size:11px;color:var(--text2)">No file uploaded</span>'}
      </div>
    `).join('') : '<div style="font-size:12px;color:var(--text2);margin-top:6px">No documents registered for this vehicle.</div>';

    resultEl.innerHTML = opsPanel(r.reg_number, r.vehicle_type || '', `
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Owner: <b style="color:var(--text)">${r.owner_name || 'Unknown'}</b></div>
      ${r.alerts.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">${r.alerts.map(a => opsBadge(a, 'red')).join('')}</div>` : `<div style="margin-bottom:12px">${opsBadge('No active alerts', 'green')}</div>`}
      <div class="ops-section-title" style="margin-top:0">Submitted Verification Documents & Files</div>
      ${docsHtml}
      ${r.violations.length ? `<div class="ops-section-title" style="margin-top:16px">Violation History</div>${opsTable(['Type', 'Location', 'When', 'Challan'], r.violations.map(v => [v.violation_type, v.location || '—', opsTimeAgo(v.created_at), v.challan ? opsBadge(v.challan.status, v.challan.status === 'Paid' ? 'green' : 'red') : '—']))}` : ''}
    `);
  } catch (e) { opsErr(resultEl, e); }
}

async function opsPoliceFlagged(body) {
  try {
    const flagged = await API.flaggedVehicles();
    body.innerHTML = opsPanel('Vehicles Needing Enforcement Action', flagged.length + ' flagged', flagged.length ? flagged.map(v => `
      <div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><b>${v.reg_number}</b> <span style="color:var(--text2);font-size:11px">· ${v.vehicle_type || '—'} · ${v.owner_name}</span></div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
          ${v.flagged_documents.map(d => opsBadge(`${d.doc_type}: ${d.status}`, opsDocTone(d.status))).join('')}
        </div>
      </div>`).join('') : `<div class="ops-empty">No flagged vehicles right now.</div>`);
  } catch (e) { opsErr(body, e); }
}

async function opsPoliceViolations(body) {
  try {
    const violations = await API.violations();
    body.innerHTML = `
      ${opsPanel('Record a New Violation', '', `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:640px">
          <input class="ops-input" id="ops-v-reg" placeholder="Reg. Number">
          <input class="ops-input" id="ops-v-type" placeholder="Violation type (e.g. Signal Jump)">
          <input class="ops-input" id="ops-v-loc" placeholder="Location">
          <input class="ops-input" id="ops-v-conf" type="number" min="0" max="1" step="0.05" placeholder="Confidence (0–1)">
        </div>
        <button class="ops-btn" style="margin-top:10px" onclick="opsRecordViolation()">Issue Violation → Auto-generate Challan</button>
      `)}
      <div class="ops-section-title">All Violations</div>
      ${opsPanel('Most recent first', violations.length + ' total', opsTable(
        ['Code', 'Vehicle', 'Type', 'Location', 'Confidence', 'Challan', 'When'],
        violations.map(v => [
          v.code, v.reg_number_text || '—', v.violation_type, v.location || '—',
          Math.round((v.confidence || 0) * 100) + '%',
          v.challan ? `₹${v.challan.amount} · ${opsBadge(v.challan.status, v.challan.status === 'Paid' ? 'green' : 'red')}` : '—',
          opsTimeAgo(v.created_at),
        ])
      ))}`;
  } catch (e) { opsErr(body, e); }
}
async function opsRecordViolation() {
  const reg_number_text = document.getElementById('ops-v-reg').value.trim();
  const violation_type = document.getElementById('ops-v-type').value.trim();
  const location = document.getElementById('ops-v-loc').value.trim();
  const confRaw = document.getElementById('ops-v-conf').value.trim();
  if (!reg_number_text || !violation_type) { toast('⚠️ Reg. number and violation type are required'); return; }
  try {
    await API.recordViolation({ reg_number_text, violation_type, location: location || null, confidence: confRaw ? parseFloat(confRaw) : 1.0 });
    toast('✅ Violation recorded — challan generated');
    opsGo('violations');
  } catch (e) { toast('⚠️ ' + e.message); }
}

async function opsPoliceReports(body) {
  try {
    const reports = await API.reports();
    body.innerHTML = opsPanel('Traffic & Infrastructure Reports', reports.length + ' total', opsTable(
      ['Code', 'Category', 'Level', 'Location', 'Status', 'Reported'],
      reports.map(r => [
        r.code, r.category, r.level ? opsBadge(r.level, opsSevTone(r.level)) : '—',
        r.address_label || '—',
        opsBadge(r.status, r.status === 'Completed' || r.status === 'Resolved' ? 'green' : 'blue'),
        opsTimeAgo(r.created_at),
      ])
    ));
  } catch (e) { opsErr(body, e); }
}

async function opsPoliceSensors(body) {
  try {
    const sensors = await API.sensors();
    body.innerHTML = opsPanel('IoT Sensor Network', sensors.length + ' devices', opsTable(
      ['Code', 'Location', 'Kind', 'Reading', 'Status', 'Last Update'],
      sensors.map(s => [
        s.code, s.location, s.kind, s.reading || (s.speed != null ? s.speed + ' km/h' : '—'),
        opsBadge(s.status, s.status === 'active' ? 'green' : 'grey'),
        opsTimeAgo(s.last_update),
      ])
    ));
  } catch (e) { opsErr(body, e); }
}

// ════════════════════════════════════════════════════════════════
// MUNICIPALITY
// ════════════════════════════════════════════════════════════════
async function opsMuniOverview(body) {
  try {
    const [queue, budget, wards] = await Promise.all([API.repairQueue(), API.budgetForecast(), API.wards()]);
    const critical = queue.filter(i => (i.severity || '').toLowerCase() === 'critical' || (i.priority || '').toLowerCase() === 'critical').length;
    const avgWardScore = wards.length ? Math.round(wards.reduce((s, w) => s + w.overall_score, 0) / wards.length) : 0;
    body.innerHTML = `
      <div class="ops-section-title">Today at a glance</div>
      <div class="ops-kpis">
        ${opsKpi(queue.length, 'Open Repair Items', critical + ' critical')}
        ${opsKpi('₹' + Math.round(budget.estimated_budget_inr).toLocaleString('en-IN'), 'Estimated Repair Cost', budget.workers_required + ' workers needed')}
        ${opsKpi(budget.high_risk_roads, 'High-Risk Roads', budget.critical_bridges + ' critical bridges')}
        ${opsKpi(avgWardScore + '/100', 'Avg. Ward Health', wards.length + ' wards tracked')}
      </div>
      <div class="ops-section-title">Priority Queue (top 6)</div>
      ${opsPanel('Sorted by AI priority', '', opsTable(
        ['Code', 'Type', 'Location', 'Severity', 'Priority', 'Status'],
        queue.slice(0, 6).map(i => [
          i.code, i.type, i.location, opsBadge(i.severity, opsSevTone(i.severity)),
          opsBadge(i.priority, opsSevTone(i.priority)), i.status,
        ])
      ))}`;
  } catch (e) { opsErr(body, e); }
}

async function opsMuniQueue(body) {
  try {
    const queue = await API.repairQueue();
    body.innerHTML = opsPanel('Infrastructure Repair Queue', queue.length + ' items', opsTable(
      ['Code', 'Type', 'Location', 'Severity', 'Priority', 'Delay', 'Status', 'Reason', 'Reported'],
      queue.map(i => [
        i.code, i.type, i.location, opsBadge(i.severity, opsSevTone(i.severity)),
        opsBadge(i.priority, opsSevTone(i.priority)), (i.delay_minutes || 0) + ' min',
        i.status, i.reason || '—', opsTimeAgo(i.created_at),
      ])
    ));
  } catch (e) { opsErr(body, e); }
}

async function opsMuniBudget(body) {
  try {
    const b = await API.budgetForecast();
    body.innerHTML = `
      <div class="ops-kpis">
        ${opsKpi(b.expected_repairs, 'Expected Repairs')}
        ${opsKpi('₹' + Math.round(b.estimated_budget_inr).toLocaleString('en-IN'), 'Estimated Budget')}
        ${opsKpi(b.workers_required, 'Workers Required')}
        ${opsKpi(b.high_risk_roads, 'High-Risk Roads')}
        ${opsKpi(b.critical_bridges, 'Critical Bridges')}
      </div>
      ${opsPanel('How this is calculated', '', `<div style="font-size:12px;color:var(--text2);line-height:1.6">
        Explainable forecast, not a fabricated estimate — derived from the current repair queue's real severity mix, road/bridge type breakdown, and standard per-repair cost/workforce multipliers. Refreshes automatically as new reports come in.
      </div>`)}`;
  } catch (e) { opsErr(body, e); }
}

async function opsMuniWards(body) { await opsSharedWards(body); }

async function opsMuniReports(body) {
  try {
    const reports = await API.reports();
    body.innerHTML = opsPanel('Citizen & Police Infrastructure Reports', reports.length + ' total', opsTable(
      ['Code', 'Category', 'Level', 'Location', 'Status', 'Reported'],
      reports.map(r => [
        r.code, r.category, r.level ? opsBadge(r.level, opsSevTone(r.level)) : '—',
        r.address_label || '—',
        opsBadge(r.status, r.status === 'Completed' || r.status === 'Resolved' ? 'green' : 'blue'),
        opsTimeAgo(r.created_at),
      ])
    ));
  } catch (e) { opsErr(body, e); }
}

// ════════════════════════════════════════════════════════════════
// SUPER ADMIN
// ════════════════════════════════════════════════════════════════
async function opsAdminOverview(body) {
  try {
    const [analytics, health, wards, sensors, flagged] = await Promise.all([
      API.governmentAnalytics(), API.cityHealth(), API.wards(), API.sensors(), API.flaggedVehicles(),
    ]);
    body.innerHTML = `
      <div class="ops-section-title">City-wide Snapshot</div>
      <div class="ops-kpis">
        ${opsKpi(analytics.active_users, 'Registered Users')}
        ${opsKpi(analytics.total_incidents, 'Total Incidents')}
        ${opsKpi(health.overall_score + '/100', 'City Health Score')}
        ${opsKpi(flagged.length, 'Flagged Vehicles')}
        ${opsKpi(sensors.length, 'IoT Sensors')}
        ${opsKpi(wards.length, 'Wards Tracked')}
      </div>
      <div class="ops-grid2" style="margin-top:8px">
        ${opsPanel('City Health Breakdown', '', `
          ${['road_health', 'bridge_health', 'traffic_efficiency', 'drainage_health', 'streetlight_health'].map(k => `
            <div style="margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
                <span style="color:var(--text2);text-transform:capitalize">${k.replace('_', ' ')}</span><b>${health[k]}</b>
              </div>
              <div class="ops-bar-track"><div class="ops-bar-fill" style="width:${health[k]}%"></div></div>
            </div>`).join('')}
        `)}
        ${opsPanel('Peak Congestion Hours', '', opsTable(
          ['Hour', 'Avg. Density', 'Samples'],
          analytics.peak_hours.map(h => [`${h.hour}:00`, h.avg_density + '%', h.record_count])
        ))}
      </div>
      <div class="ops-section-title">Accident Hotspots</div>
      ${opsPanel('Most-reported locations', '', opsTable(
        ['Location', 'Incidents', 'Most Common Type'],
        analytics.accident_hotspots.map(h => [h.location, h.incident_count, h.most_common_type])
      ))}
      ${analytics.avg_repair_hours != null ? opsPanel('Avg. Repair Time', '', `<div class="ops-kpi-val" style="font-size:20px">${analytics.avg_repair_hours} hours</div>`) : ''}`;
  } catch (e) { opsErr(body, e); }
}

async function opsAdminCityHealth(body) {
  try {
    const health = await API.cityHealth();
    body.innerHTML = `
      <div class="ops-kpis">
        ${opsKpi(health.overall_score + '/100', 'Overall City Score')}
        ${opsKpi(health.infrastructure_health, 'Infrastructure Health')}
        ${opsKpi(health.traffic_efficiency, 'Traffic Efficiency')}
      </div>
      ${opsPanel('Component Breakdown', '', ['road_health', 'bridge_health', 'drainage_health', 'streetlight_health'].map(k => `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px">
            <span style="color:var(--text2);text-transform:capitalize">${k.replace('_', ' ')}</span><b>${health[k]}/100</b>
          </div>
          <div class="ops-bar-track"><div class="ops-bar-fill" style="width:${health[k]}%"></div></div>
        </div>`).join(''))}`;
  } catch (e) { opsErr(body, e); }
}

async function opsAdminWards(body) { await opsSharedWards(body); }

async function opsSharedWards(body) {
  try {
    const wards = await API.wards();
    body.innerHTML = opsPanel('Ward-by-Ward Comparison', wards.length + ' wards', opsTable(
      ['Ward', 'Overall', 'Road', 'Bridge', 'Traffic', 'Drainage', 'Streetlight', 'Budget Used'],
      wards.map(w => [
        `<b>${w.name}</b>`, opsBadge(w.overall_score, w.overall_score >= 70 ? 'green' : w.overall_score >= 40 ? 'yellow' : 'red'),
        w.road_health, w.bridge_health, w.traffic_efficiency, w.drainage_health, w.streetlight_health,
        `₹${Math.round(w.budget_used).toLocaleString('en-IN')} / ₹${Math.round(w.budget_allocated).toLocaleString('en-IN')}`,
      ])
    ));
  } catch (e) { opsErr(body, e); }
}

async function opsAdminAnalytics(body) {
  try {
    const a = await API.governmentAnalytics();
    body.innerHTML = `
      <div class="ops-kpis">
        ${opsKpi(a.active_users, 'Active Users')}
        ${opsKpi(a.total_incidents, 'Total Incidents')}
        ${opsKpi(a.avg_repair_hours != null ? a.avg_repair_hours + 'h' : '—', 'Avg. Repair Time')}
      </div>
      <div class="ops-grid2">
        ${opsPanel('Peak Congestion Hours', 'Real aggregation from traffic records', opsTable(
          ['Hour', 'Avg. Density', 'Samples'],
          a.peak_hours.map(h => [`${h.hour}:00`, h.avg_density + '%', h.record_count])
        ))}
        ${opsPanel('Accident Hotspots', 'Real aggregation from incident reports', opsTable(
          ['Location', 'Incidents', 'Most Common Type'],
          a.accident_hotspots.map(h => [h.location, h.incident_count, h.most_common_type])
        ))}
      </div>`;
  } catch (e) { opsErr(body, e); }
}

async function opsAdminEnforcement(body) {
  try {
    const [flagged, violations] = await Promise.all([API.flaggedVehicles(), API.violations()]);
    const unpaid = violations.filter(v => v.challan && v.challan.status === 'Unpaid');
    body.innerHTML = `
      <div class="ops-kpis">
        ${opsKpi(flagged.length, 'Flagged Vehicles')}
        ${opsKpi(violations.length, 'Total Violations')}
        ${opsKpi(unpaid.length, 'Unpaid Challans')}
      </div>
      ${opsPanel('Recent Violations', '', opsTable(
        ['Code', 'Vehicle', 'Type', 'Challan', 'When'],
        violations.slice(0, 10).map(v => [
          v.code, v.reg_number_text || '—', v.violation_type,
          v.challan ? opsBadge(v.challan.status, v.challan.status === 'Paid' ? 'green' : 'red') : '—',
          opsTimeAgo(v.created_at),
        ])
      ))}`;
  } catch (e) { opsErr(body, e); }
}

async function opsAdminSensors(body) { await opsPoliceSensors(body); }
async function opsAdminReports(body) { await opsPoliceReports(body); }

// ════════════════════════════════════════════════════════════════
const OPS_RENDERERS = {
  police: {
    overview: opsPoliceOverview, verify: opsPoliceVerify, flagged: opsPoliceFlagged,
    violations: opsPoliceViolations, reports: opsPoliceReports, sensors: opsPoliceSensors,
  },
  muni: {
    overview: opsMuniOverview, queue: opsMuniQueue, budget: opsMuniBudget,
    wards: opsMuniWards, reports: opsMuniReports,
  },
  admin: {
    overview: opsAdminOverview, cityhealth: opsAdminCityHealth, wards: opsAdminWards,
    analytics: opsAdminAnalytics, enforcement: opsAdminEnforcement, sensors: opsAdminSensors,
    reports: opsAdminReports,
  },
};