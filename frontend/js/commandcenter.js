// ════════════════════════════════════════════════════════════════
// COMMAND CENTER — role-aware dashboards for Citizen / Traffic Police /
// Municipality / Government, all backed by real endpoints added to the
// FastAPI backend (vehicles, enforcement, municipality, government).
// Reuses the same design system (icard/irow/dbtable/spinp/spbtn) as the
// rest of the app so it feels native, not bolted on.
// ════════════════════════════════════════════════════════════════
const POLICE_ROLES = ['admin', 'Traffic Engineer', 'Emergency Manager'];
const MUNI_ROLES = ['admin', 'City Planner', 'Traffic Engineer', 'Analyst'];
const GOV_ROLES = ['admin', 'City Planner', 'Analyst'];
const EMERGENCY_OP_ROLES = ['admin', 'Emergency Operator'];

let ccOpen = false, ccActiveTab = 'citizen';

function toggleCC() {
  ccOpen = !ccOpen;
  document.getElementById('ccpanel').classList.toggle('show', ccOpen);
  if (ccOpen) { renderCCTabs(); ccTab(ccActiveTab); }
}

function ccAvailableTabs() {
  const role = CU?.role || 'Citizen';
  const tabs = [{ id: 'citizen', label: '🚗 My Vehicles' }, { id: 'emergency-citizen', label: '🚨 Medical Emergency' }];
  if (POLICE_ROLES.includes(role)) tabs.push({ id: 'police', label: '🚓 Traffic Police' });
  if (EMERGENCY_OP_ROLES.includes(role)) tabs.push({ id: 'emergency-center', label: '🚑 Emergency Center' });
  if (MUNI_ROLES.includes(role)) tabs.push({ id: 'muni', label: '🏗️ Municipality' });
  if (GOV_ROLES.includes(role)) tabs.push({ id: 'gov', label: '🏛️ Government' });
  return tabs;
}

function renderCCTabs() {
  const tabs = ccAvailableTabs();
  if (!tabs.find(t => t.id === ccActiveTab)) ccActiveTab = tabs[0].id;
  document.getElementById('cc-tabs').innerHTML = tabs.map(t =>
    `<button class="dbtab${t.id === ccActiveTab ? ' on' : ''}" onclick="ccTab('${t.id}')">${t.label}</button>`
  ).join('');
}

function ccTab(id) {
  ccActiveTab = id;
  renderCCTabs();
  const body = document.getElementById('cc-body');
  body.innerHTML = `<div class="sdrop-info"><div class="spin"></div>Loading...</div>`;
  if (id === 'citizen') renderCitizenTab(body);
  else if (id === 'emergency-citizen') renderEmergencyCitizenTab(body);
  else if (id === 'police') renderPoliceTab(body);
  else if (id === 'emergency-center') renderEmergencyCenterTab(body);
  else if (id === 'muni') renderMuniTab(body);
  else if (id === 'gov') renderGovTab(body);
}

// ────────────────────────────────────────────────────────────────
// CITIZEN: My Vehicles + digital documents + expiry alerts
// ────────────────────────────────────────────────────────────────
async function renderCitizenTab(body) {
  try {
    const vehicles = await API.myVehicles();
    const docStatusColor = s => s === 'Expired' ? '#c5221f' : s === 'Expiring Soon' ? '#b06000' : '#137333';
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:#202124">Registered Vehicles</div>
        <button class="spbtn" style="width:auto;margin:0;padding:8px 14px" onclick="ccShowAddVehicle()">+ Add Vehicle</button>
      </div>
      <div id="cc-add-vehicle-form" style="display:none;margin-bottom:14px"></div>
      <div style="display:grid;gap:10px">
        ${vehicles.map(v => `
          <div class="icard" style="margin:0;border:1px solid #e8eaed;border-radius:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div><b style="font-size:14px">${v.reg_number}</b> <span style="color:#5f6368;font-size:12px">· ${v.vehicle_type} ${v.manufacturer || ''} ${v.model || ''} ${v.year || ''}</span></div>
              <button class="mbtn-cancel" style="padding:5px 10px;font-size:11px" onclick="ccDeleteVehicle(${v.id})">Remove</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${v.documents.map(d => `<span class="sdi-tag" style="background:#f8f9fa;color:${docStatusColor(d.status)};border:1px solid ${docStatusColor(d.status)}22">${d.doc_type}: ${d.status}</span>`).join('') || '<span style="font-size:11px;color:#9aa0a6">No documents added yet</span>'}
              <button style="border:none;background:#e8f0fe;color:var(--blue);border-radius:7px;padding:3px 9px;font-size:10px;font-weight:700;cursor:pointer" onclick="ccShowAddDoc(${v.id})">+ Add Document</button>
            </div>
            <div id="cc-doc-form-${v.id}" style="display:none;margin-top:8px"></div>
          </div>`).join('') || '<div style="color:#9aa0a6;font-size:13px;padding:20px;text-align:center">No vehicles yet — add one above.</div>'}
      </div>
      <div id="cc-mychallans-section" style="margin-top:18px"></div>
      <div id="cc-myreports-section" style="margin-top:18px"></div>`;
    renderMyReportsSection();
    renderMyChallansSection();
  } catch (e) {
    body.innerHTML = `<div style="color:#c5221f;padding:16px">Could not load vehicles: ${e.message}</div>`;
  }
}

async function renderMyChallansSection() {
  const el = document.getElementById('cc-mychallans-section');
  if (!el) return;
  try {
    const challans = await API.myChallans();
    const statusColor = s => s === 'Paid' ? '#137333' : s === 'Unpaid' ? '#c5221f' : '#b06000';
    el.innerHTML = `
      <div class="icard-t" style="padding:0 4px">My Challans</div>
      ${challans.length ? `<table class="dbtable"><thead><tr><th>Vehicle</th><th>Violation</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>${challans.map(v => `<tr><td>${v.reg_number_text || '—'}</td><td>${v.violation_type}</td><td>₹${v.challan?.amount || '—'}</td>
        <td><b style="color:${statusColor(v.challan?.status)}">${v.challan?.status || '—'}</b></td>
        <td>${v.challan?.status === 'Unpaid' ? `<button class="mbtn-ok" style="padding:4px 10px;font-size:11px" onclick="ccPayChallan(${v.challan.id})">Pay Now</button>` : '—'}</td>
      </tr>`).join('')}</tbody></table>` : '<div style="color:#9aa0a6;font-size:13px;padding:10px 0">No challans on your vehicles. 🎉</div>'}`;
  } catch (e) {
    el.innerHTML = `<div style="color:#c5221f;padding:8px">Could not load challans: ${e.message}</div>`;
  }
}
async function ccPayChallan(id) {
  try { await API.payChallan(id); toast('✅ Challan paid'); renderMyChallansSection(); }
  catch (e) { toast('⚠️ ' + e.message); }
}

function ccShowAddVehicle() {
  const el = document.getElementById('cc-add-vehicle-form');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  el.innerHTML = `
    <div class="icard" style="margin:0;background:#f8f9fa">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <input class="spinp" id="cc-v-reg" placeholder="Reg. Number (e.g. KA-01-AB-1234)" style="margin:0">
        <input class="spinp" id="cc-v-type" placeholder="Type (Car/Bike/Auto)" style="margin:0">
        <input class="spinp" id="cc-v-make" placeholder="Manufacturer" style="margin:0">
        <input class="spinp" id="cc-v-model" placeholder="Model" style="margin:0">
        <input class="spinp" id="cc-v-year" placeholder="Year" type="number" style="margin:0">
        <input class="spinp" id="cc-v-fuel" placeholder="Fuel Type" style="margin:0">
      </div>
      <button class="spbtn" onclick="ccAddVehicle()">Save Vehicle</button>
    </div>`;
}
async function ccAddVehicle() {
  try {
    await API.addVehicle({
      reg_number: document.getElementById('cc-v-reg').value.trim(),
      vehicle_type: document.getElementById('cc-v-type').value.trim() || 'Car',
      manufacturer: document.getElementById('cc-v-make').value.trim(),
      model: document.getElementById('cc-v-model').value.trim(),
      year: parseInt(document.getElementById('cc-v-year').value) || null,
      fuel_type: document.getElementById('cc-v-fuel').value.trim(),
    });
    toast('✅ Vehicle added');
    ccTab('citizen');
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function ccDeleteVehicle(id) {
  try { await API.deleteVehicle(id); toast('Vehicle removed'); ccTab('citizen'); }
  catch (e) { toast('⚠️ ' + e.message); }
}

function ccShowAddDoc(vehicleId) {
  const el = document.getElementById(`cc-doc-form-${vehicleId}`);
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  el.innerHTML = `
    <div style="background:#f8f9fa;padding:10px;border-radius:8px;margin-top:8px;border:1px solid #e8eaed">
      <div style="font-size:11px;font-weight:700;margin-bottom:6px;color:#202124">Add Vehicle Document & Upload File</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
        <select id="cc-d-type-${vehicleId}" class="spinp" style="margin:0"><option>RC</option><option>Insurance</option><option>PUC</option><option>Licence</option><option>Fitness</option></select>
        <input class="spinp" id="cc-d-num-${vehicleId}" placeholder="Doc Number" style="margin:0">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
        <input class="spinp" id="cc-d-exp-${vehicleId}" type="date" style="margin:0" title="Expiry Date">
        <input type="file" id="cc-d-file-${vehicleId}" accept="image/*,.pdf" style="font-size:11px;padding:4px">
      </div>
      <button class="spbtn" style="padding:6px 12px;font-size:11px" onclick="ccAddDoc(${vehicleId})">Upload &amp; Save Document</button>
    </div>`;
}

async function ccAddDoc(vehicleId) {
  try {
    const fileInput = document.getElementById(`cc-d-file-${vehicleId}`);
    let fileUrl = null;

    if (fileInput.files.length > 0) {
      toast('📤 Uploading document file...');
      const uploadRes = await API.uploadPhoto(fileInput.files[0]);
      fileUrl = uploadRes.url;
    }

    const exp = document.getElementById(`cc-d-exp-${vehicleId}`).value;
    await API.addDocument(vehicleId, {
      doc_type: document.getElementById(`cc-d-type-${vehicleId}`).value,
      doc_number: document.getElementById(`cc-d-num-${vehicleId}`).value.trim(),
      expires_on: exp ? new Date(exp).toISOString() : null,
      file_url: fileUrl,
    });
    toast('✅ Document added successfully');
    ccTab('citizen');
  } catch (e) { toast('⚠️ ' + e.message); }
}

// ────────────────────────────────────────────────────────────────
// TRAFFIC POLICE: violations, e-challans, vehicle lookup
// ────────────────────────────────────────────────────────────────
async function renderPoliceTab(body) {
  try {
    const [violations, flagged, notifications, activeNavs] = await Promise.all([
      API.violations(), API.flaggedVehicles(), API.notifications(), API.activeNavigations()
    ]);
    const emergencies = notifications.filter(n => n.title.includes('🚨'));
    const expiredCount = flagged.filter(f => f.flagged_documents.some(d => d.status === 'Expired')).length;
    const soonCount = flagged.length - expiredCount;
    body.innerHTML = `
      ${emergencies.length ? `<div class="icard" style="margin:0 0 14px;background:#c5221f;color:#fff;border:none">
        <div class="icard-t" style="color:#fff;margin:0 0 8px">🚨 Active Emergency Alerts (${emergencies.length})</div>
        ${emergencies.map(n => `<div style="background:rgba(255,255,255,.15);border-radius:8px;padding:10px;margin-bottom:6px;font-size:12px;line-height:1.5">
          <b>${n.title.replace('🚨 ', '')}</b><br>${n.body}<br>
          <span style="opacity:.8;font-size:10px">${new Date(n.created_at).toLocaleString()}</span>
        </div>`).join('')}
      </div>` : ''}
      <div class="icard" style="margin:0 0 14px;background:#e8f0fe">
        <div class="icard-t" style="color:var(--blue);margin:0 0 8px">🧭 Live Navigation Sessions (${activeNavs.length}) — Phase 6</div>
        ${activeNavs.length ? `<table class="dbtable"><thead><tr><th>Citizen</th><th>From</th><th>To</th><th>ETA</th><th>Started</th></tr></thead>
        <tbody>${activeNavs.map(n => `<tr><td>${n.citizen_name}</td><td>${n.origin_label || '—'}</td><td>${n.destination_label || '—'}</td><td>${n.eta_minutes ? n.eta_minutes + ' min' : '—'}</td><td>${new Date(n.started_at).toLocaleTimeString()}</td></tr>`).join('')}</tbody></table>`
        : '<div style="font-size:12px;color:#5f6368">No citizens currently navigating.</div>'}
      </div>
      <div class="icard" style="margin:0 0 14px;background:#fdf3f2;border:1px solid #f3c6c1">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div class="icard-t" style="color:#c5221f;margin:0">🚨 Flagged Vehicles — Document Alerts (${flagged.length})</div>
          <div style="font-size:11px;color:#5f6368"><b style="color:#c5221f">${expiredCount} expired</b> · <b style="color:#b06000">${soonCount} expiring soon</b></div>
        </div>
        ${flagged.length ? `<table class="dbtable"><thead><tr><th>Reg. Number</th><th>Owner</th><th>Type</th><th>Flagged Documents</th></tr></thead>
        <tbody>${flagged.map(f => `<tr>
          <td><b>${f.reg_number}</b></td><td>${f.owner_name}</td><td>${f.vehicle_type}</td>
          <td>${f.flagged_documents.map(d => `<span class="sdi-tag" style="background:${d.status === 'Expired' ? '#fce8e6' : '#fef7e0'};color:${d.status === 'Expired' ? '#c5221f' : '#b06000'};margin-right:4px">${d.doc_type}:${d.status}</span>`).join('')}</td>
        </tr>`).join('')}</tbody></table>` : `<div style="color:#137333;font-size:13px;padding:10px 0">✅ No flagged vehicles — every registered document is currently valid.</div>`}
      </div>
      <div class="icard" style="margin:0 0 14px;background:#f8f9fa">
        <div class="icard-t">Vehicle Lookup (ANPR-style) — View Citizen Documents</div>
        <div style="display:flex;gap:8px">
          <input class="spinp" id="cc-lookup-reg" placeholder="Enter registration number" style="margin:0">
          <button class="spbtn" style="width:auto;margin:0;padding:9px 16px" onclick="ccLookup()">Lookup</button>
        </div>
        <div id="cc-lookup-result" style="margin-top:10px"></div>
      </div>
      <div class="icard" style="margin:0 0 14px;background:#f8f9fa">
        <div class="icard-t">📢 Notify Control Room</div>
        <div style="display:flex;gap:8px">
          <input class="spinp" id="cc-notify-msg" placeholder="e.g. Backup needed at Silk Board junction" style="margin:0">
          <button class="spbtn" style="width:auto;margin:0;padding:9px 16px" onclick="ccNotifyControlRoom()">Send Alert</button>
        </div>
      </div>
      <div class="icard" style="margin:0 0 14px;background:#f8f9fa">
        <div class="icard-t">Record Violation → auto-generates e-Challan</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <input class="spinp" id="cc-vio-reg" placeholder="Reg. Number" style="margin:0">
          <select id="cc-vio-type" class="spinp" style="margin:0">
            <option>Helmet</option><option>Seatbelt</option><option>Wrong-way Driving</option>
            <option>Red-light Jump</option><option>Illegal Parking</option><option>Lane Discipline</option><option>Speeding</option>
          </select>
          <input class="spinp" id="cc-vio-loc" placeholder="Location" style="margin:0">
        </div>
        <button class="spbtn" onclick="ccRecordViolation()">Issue e-Challan</button>
      </div>
      <div class="icard-t" style="padding:0 4px">Recent Violations (${violations.length})</div>
      <table class="dbtable"><thead><tr><th>Code</th><th>Vehicle</th><th>Violation</th><th>Location</th><th>Challan</th><th>Status</th></tr></thead>
      <tbody>${violations.map(v => `<tr><td>${v.code}</td><td>${v.reg_number_text || '—'}</td><td>${v.violation_type}</td><td>${v.location || '—'}</td><td>₹${v.challan?.amount || '—'}</td><td>${v.challan?.status || '—'}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) {
    body.innerHTML = `<div style="color:#c5221f;padding:16px">Could not load police data: ${e.message}</div>`;
  }
}

async function ccLookup() {
  const reg = document.getElementById('cc-lookup-reg').value.trim();
  if (!reg) return;
  const out = document.getElementById('cc-lookup-result');
  out.innerHTML = 'Searching...';
  try {
    const r = await API.lookupVehicle(reg);
    if (!r.found) { out.innerHTML = `<span style="color:#c5221f">No record found for ${reg}.</span>`; return; }
    
    const docsHtml = r.documents && r.documents.length ? r.documents.map(d => `
      <div style="background:#fff;padding:8px 10px;margin-top:6px;border-radius:6px;border:1px solid #e8eaed;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <b>${d.doc_type}</b> <span style="font-size:11px;color:#5f6368">(#${d.doc_number || 'N/A'})</span><br>
            <span style="font-size:11px;font-weight:700;color:${d.status === 'Expired' ? '#c5221f' : '#137333'}">${d.status}</span>
            ${d.expires_on ? `<span style="font-size:10px;color:#9aa0a6"> · Exp: ${new Date(d.expires_on).toLocaleDateString()}</span>` : ''}
          </div>
        </div>
        ${d.file_url ? `
        <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #e8eaed;">
          <div style="font-size:10px;font-weight:700;color:var(--blue);margin-bottom:4px;">Attached Document:</div>
          <img src="${API.getBase()}${d.file_url}" style="max-width:100%; border-radius:4px; border:1px solid #ddd;" 
               onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
          <div style="display:none; color:#c5221f; font-size:11px; padding:6px; background:#fce8e6; border-radius:4px;">
            ⚠️ <b>File Unavailable:</b> The image was wiped by a Render server restart. Please ask the citizen to re-upload.
          </div>
        </div>` : '<div style="font-size:10px;color:#9aa0a6;margin-top:4px">No file uploaded</div>'}
      </div>
    `).join('') : '<div style="font-size:11px;color:#9aa0a6;margin-top:4px">No documents registered for this vehicle.</div>';

    out.innerHTML = `
      <div style="font-size:12px;line-height:1.6">
        <div><b>Owner Name:</b> ${r.owner_name || 'Unknown'}</div>
        <div><b>Vehicle Type:</b> ${r.vehicle_type || '—'}</div>
        <div style="margin:6px 0">${r.alerts.map(a => `<span class="sdi-tag" style="background:#fce8e6;color:#c5221f;margin-right:4px">${a}</span>`).join('') || ''}</div>
        <div style="margin-top:10px;font-weight:700;color:#202124">Submitted Verification Documents & Files:</div>
        ${docsHtml}
      </div>
      <button class="mbtn-cancel" style="padding:6px 12px;font-size:11px;margin-top:10px" onclick="ccMarkInspected('${reg}')">✓ Mark Vehicle Inspected</button>`;
  } catch (e) { out.innerHTML = `<span style="color:#c5221f">${e.message}</span>`; }
}

async function ccMarkInspected(reg) {
  try { await API.inspectVehicle(reg, 'Routine roadside check'); toast('✅ Inspection recorded'); }
  catch (e) { toast('⚠️ ' + e.message); }
}
async function ccNotifyControlRoom() {
  const msg = document.getElementById('cc-notify-msg').value.trim();
  if (!msg) { toast('⚠️ Enter a message first'); return; }
  try {
    await API.notifyControlRoom(msg);
    toast('✅ Alert sent to Control Room');
    document.getElementById('cc-notify-msg').value = '';
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function ccRecordViolation() {
  try {
    await API.recordViolation({
      reg_number_text: document.getElementById('cc-vio-reg').value.trim(),
      violation_type: document.getElementById('cc-vio-type').value,
      location: document.getElementById('cc-vio-loc').value.trim(),
    });
    toast('✅ Violation recorded, e-Challan issued');
    ccTab('police');
  } catch (e) { toast('⚠️ ' + e.message); }
}

// ────────────────────────────────────────────────────────────────
// MUNICIPALITY: AI repair priority queue + predictive budget
// ────────────────────────────────────────────────────────────────
async function renderMuniTab(body) {
  try {
    const [queue, budget] = await Promise.all([API.repairQueue(), API.budgetForecast()]);
    const pColor = p => p === 'Critical' ? '#c5221f' : p === 'High' ? '#d84315' : p === 'Medium' ? '#b06000' : '#137333';
    body.innerHTML = `
      <div class="ptrow" style="margin-bottom:14px">
        <div class="ptcell"><div class="ptv">${budget.expected_repairs}</div><div class="ptl">Expected Repairs</div></div>
        <div class="ptcell"><div class="ptv">₹${(budget.estimated_budget_inr / 100000).toFixed(1)}L</div><div class="ptl">Est. Budget</div></div>
        <div class="ptcell"><div class="ptv">${budget.workers_required}</div><div class="ptl">Workers Needed</div></div>
        <div class="ptcell"><div class="ptv">${budget.high_risk_roads}</div><div class="ptl">High-Risk Roads</div></div>
      </div>
      <div class="icard-t" style="padding:0 4px">AI Repair Priority Queue</div>
      <table class="dbtable"><thead><tr><th>Code</th><th>Type</th><th>Location</th><th>Priority</th><th>Reason</th><th>Status</th></tr></thead>
      <tbody>${queue.map(i => `<tr><td>${i.code}</td><td>${i.type}</td><td>${i.location}</td><td><b style="color:${pColor(i.priority)}">${i.priority}</b></td><td style="white-space:normal;max-width:260px">${i.reason || '—'}</td><td>${i.status}</td></tr>`).join('')}</tbody></table>
      <div id="cc-dataset-section" style="margin-top:16px"></div>`;
    renderDatasetSection();
  } catch (e) {
    body.innerHTML = `<div style="color:#c5221f;padding:16px">Could not load municipality data: ${e.message}</div>`;
  }
}

// ────────────────────────────────────────────────────────────────
// GOVERNMENT: City Health Index + ward comparison
// ────────────────────────────────────────────────────────────────
async function renderGovTab(body) {
  try {
    const [health, wardList, analytics] = await Promise.all([API.cityHealth(), API.wards(), API.governmentAnalytics()]);
    const scoreColor = s => s >= 80 ? '#137333' : s >= 60 ? '#b06000' : '#c5221f';
    body.innerHTML = `
      <div class="pcard" style="background:#f0f7ff;border-radius:10px;margin:0 0 14px;padding:16px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:11px;font-weight:800;color:var(--blue);text-transform:uppercase">City Health Index</div>
            <div style="font-size:34px;font-weight:800;color:${scoreColor(health.overall_score)}">${health.overall_score}<span style="font-size:16px;color:#9aa0a6">/100</span></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:11px">
            <div>Roads: <b>${health.road_health}</b></div><div>Bridges: <b>${health.bridge_health}</b></div>
            <div>Traffic: <b>${health.traffic_efficiency}</b></div><div>Drainage: <b>${health.drainage_health}</b></div>
            <div>Streetlights: <b>${health.streetlight_health}</b></div><div>Infra: <b>${health.infrastructure_health}</b></div>
          </div>
        </div>
      </div>
      <div class="ptrow" style="margin-bottom:14px">
        <div class="ptcell"><div class="ptv">${analytics.active_users}</div><div class="ptl">Active Users</div></div>
        <div class="ptcell"><div class="ptv">${analytics.total_incidents}</div><div class="ptl">Total Incidents</div></div>
        <div class="ptcell"><div class="ptv">${analytics.avg_repair_hours ?? '—'}</div><div class="ptl">Avg Repair (hrs)</div></div>
      </div>
      <div class="icard-t" style="padding:0 4px">Peak Congestion Hours</div>
      <div class="ptrow" style="margin-bottom:14px">${analytics.peak_hours.map(h => `<div class="ptcell"><div class="ptv ${h.avg_density > 65 ? 'ch' : h.avg_density > 35 ? 'cm' : 'cf'}">${h.avg_density}%</div><div class="ptl">${h.hour}:00</div></div>`).join('')}</div>
      <div class="icard-t" style="padding:0 4px">Incident Hotspots</div>
      <table class="dbtable" style="margin-bottom:16px"><thead><tr><th>Location</th><th>Incidents</th><th>Most Common Type</th></tr></thead>
      <tbody>${analytics.accident_hotspots.map(h => `<tr><td>${h.location}</td><td>${h.incident_count}</td><td>${h.most_common_type}</td></tr>`).join('')}</tbody></table>
      <div class="icard-t" style="padding:0 4px">Ward Comparison</div>
      <table class="dbtable"><thead><tr><th>Ward</th><th>Roads</th><th>Bridges</th><th>Traffic</th><th>Drainage</th><th>Streetlights</th><th>Overall</th><th>Budget Used</th></tr></thead>
      <tbody>${wardList.map(w => `<tr><td>${w.name}</td><td>${w.road_health}</td><td>${w.bridge_health}</td><td>${w.traffic_efficiency}</td><td>${w.drainage_health}</td><td>${w.streetlight_health}</td><td><b style="color:${scoreColor(w.overall_score)}">${w.overall_score}</b></td><td>₹${(w.budget_used / 100000).toFixed(1)}L / ₹${(w.budget_allocated / 100000).toFixed(1)}L</td></tr>`).join('')}</tbody></table>`;
  } catch (e) {
    body.innerHTML = `<div style="color:#c5221f;padding:16px">Could not load government data: ${e.message}</div>`;
  }
}

// ────────────────────────────────────────────────────────────────
// NOTIFICATIONS BELL — real backend data (document expiry reminders,
// emergency alerts), polled on login and whenever the panel opens.
// ────────────────────────────────────────────────────────────────
let notifPollInt = null;

function startNotifPolling() {
  refreshNotifBadge();
  if (notifPollInt) clearInterval(notifPollInt);
  notifPollInt = setInterval(refreshNotifBadge, 30000);
}
async function refreshNotifBadge() {
  if (!CU) return;
  try {
    const notifs = await API.notifications();
    const unread = notifs.filter(n => !n.is_read).length;
    const badge = document.getElementById('notif-badge');
    if (unread > 0) { badge.textContent = unread > 9 ? '9+' : unread; badge.style.display = 'flex'; }
    else { badge.style.display = 'none'; }
  } catch (e) { /* silent — non-critical */ }
}
async function toggleNotifs() {
  const panel = document.getElementById('notifpanel');
  const opening = !panel.classList.contains('show');
  panel.classList.toggle('show');
  if (!opening) return;
  const body = document.getElementById('notif-body');
  body.innerHTML = `<div class="sdrop-info"><div class="spin"></div>Loading...</div>`;
  try {
    const notifs = await API.notifications();
    body.innerHTML = notifs.length ? notifs.map(n => `
      <div style="padding:10px;border-bottom:1px solid #f8f9fa;${n.is_read ? 'opacity:.6' : ''}" onclick="markNotifRead(${n.id}, this)">
        <div style="font-size:12px;font-weight:700;color:#202124">${n.title}</div>
        <div style="font-size:11px;color:#5f6368;margin-top:2px">${n.body}</div>
        <div style="font-size:9px;color:#9aa0a6;margin-top:4px">${new Date(n.created_at).toLocaleString()}</div>
      </div>`).join('') : `<div style="padding:20px;text-align:center;color:#9aa0a6;font-size:13px">No notifications yet.</div>`;
    refreshNotifBadge();
  } catch (e) {
    body.innerHTML = `<div style="color:#c5221f;padding:16px">Could not load notifications: ${e.message}</div>`;
  }
}
async function markNotifRead(id, el) {
  try { await fetch(`${API.getBase()}/api/v1/notifications/${id}/read`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + API.getToken() } }); el.style.opacity = '.6'; refreshNotifBadge(); } catch (e) { }
}

// ────────────────────────────────────────────────────────────────
// DATASET UPLOAD (Phase 13) — appended to the Municipality tab
// ────────────────────────────────────────────────────────────────
async function renderDatasetSection() {
  const el = document.getElementById('cc-dataset-section');
  if (!el) return;
  try {
    const datasets = await API.listDatasets();
    el.innerHTML = `
      <div class="icard-t" style="padding:0 4px">Uploaded Datasets (Phase 13 — IoT/Survey Data Ingestion)</div>
      <div class="icard" style="margin:0 0 14px;background:#f8f9fa">
        <p style="font-size:12px;color:#5f6368;margin-bottom:8px">Upload a CSV with columns: <code>location, speed, density, flow</code>. Rows are imported directly into the traffic records feeding the ML model.</p>
        <input type="file" id="cc-dataset-file" accept=".csv" style="margin-bottom:8px">
        <button class="spbtn" onclick="ccUploadDataset()">Upload &amp; Import</button>
        <div id="cc-dataset-result" style="margin-top:8px;font-size:12px"></div>
      </div>
      <table class="dbtable"><thead><tr><th>File</th><th>Rows</th><th>Imported</th><th>Status</th><th>Uploaded</th></tr></thead>
      <tbody>${datasets.map(d => `<tr><td>${d.filename}</td><td>${d.row_count}</td><td>${d.records_imported}</td><td>${d.status}</td><td>${new Date(d.uploaded_at).toLocaleString()}</td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#9aa0a6">No datasets uploaded yet</td></tr>'}</tbody></table>`;
  } catch (e) {
    el.innerHTML = `<div style="color:#c5221f;padding:8px">Could not load datasets: ${e.message}</div>`;
  }
}
async function ccUploadDataset() {
  const input = document.getElementById('cc-dataset-file');
  const result = document.getElementById('cc-dataset-result');
  if (!input.files.length) { toast('⚠️ Choose a CSV file first'); return; }
  result.textContent = 'Uploading...';
  try {
    const res = await API.uploadDataset(input.files[0]);
    result.innerHTML = `<span style="color:#137333">✅ ${res.summary}</span>`;
    toast('✅ Dataset imported');
    renderDatasetSection();
  } catch (e) {
    result.innerHTML = `<span style="color:#c5221f">${e.message}</span>`;
  }
}

// ────────────────────────────────────────────────────────────────
// COMPLAINT STATUS STEPPER (Phase 14) — visual progress for a report
// ────────────────────────────────────────────────────────────────
const COMPLAINT_STEPS = ['Submitted', 'Under AI Analysis', 'Verified', 'Assigned', 'Repair In Progress', 'Inspection Pending', 'Completed', 'Closed'];
function renderStatusStepper(currentStatus) {
  const idx = Math.max(0, COMPLAINT_STEPS.indexOf(currentStatus));
  return `<div style="display:flex;align-items:center;gap:2px;margin:8px 0;overflow-x:auto;padding-bottom:4px">
    ${COMPLAINT_STEPS.map((s, i) => `
      <div style="display:flex;align-items:center;flex-shrink:0">
        <div style="width:20px;height:20px;border-radius:50%;background:${i <= idx ? 'var(--blue)' : '#e8eaed'};color:${i <= idx ? '#fff' : '#9aa0a6'};font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center">${i < idx ? '✓' : i + 1}</div>
        <div style="font-size:9px;color:${i <= idx ? '#202124' : '#9aa0a6'};font-weight:${i === idx ? '800' : '600'};margin:0 4px;white-space:nowrap">${s}</div>${i < COMPLAINT_STEPS.length - 1 ? `<div style="width:14px;height:2px;background:${i < idx ? 'var(--blue)' : '#e8eaed'}"></div>` : ''}
      </div>`).join('')}
  </div>`;
}

async function renderMyReportsSection() {
  const el = document.getElementById('cc-myreports-section');
  if (!el || !CU) return;
  try {
    const all = await API.myReports();
    el.innerHTML = `
      <div class="icard-t" style="padding:0 4px">My Complaint Tracking</div>
      ${all.length ? all.slice(0, 8).map(r => `
        <div class="icard" style="margin:0 0 10px;background:#f8f9fa">
          <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#202124"><span>${r.code} · ${r.category}</span><span>${r.status}</span></div>${renderStatusStepper(r.status)}
        </div>`).join('') : '<div style="color:#9aa0a6;font-size:13px;padding:10px 0">No reports submitted yet.</div>'}`;
  } catch (e) {
    el.innerHTML = `<div style="color:#c5221f;padding:8px">Could not load reports: ${e.message}</div>`;
  }
}

// ────────────────────────────────────────────────────────────────
// MEDICAL EMERGENCY — citizen-facing report + status tracker
// ────────────────────────────────────────────────────────────────
let emergencyPinMode = false;
let emergencyPinMk = null;
let emergencyLoc = null;
let emergencyPhotoUrl = null;

async function renderEmergencyCitizenTab(body) {
  try {
    const [mine, contacts] = await Promise.all([API.myEmergencies(), API.emergencyContacts()]);
    body.innerHTML = `
      <div class="icard" style="margin:0 0 14px;background:#fdf3f2;border:1px solid #f3c6c1">
        <div class="icard-t" style="color:#c5221f;margin:0 0 10px">🚨 Report a Medical Emergency</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <button class="rpt-opt" onclick="emStartReport('Road Accident')">🚗 Road Accident</button>
          <button class="rpt-opt" onclick="emStartReport('Medical Emergency')">🏥 Medical Emergency</button>
          <button class="rpt-opt" onclick="emStartReport('Person Injured')">🧍 Person Injured</button>
          <button class="rpt-opt" onclick="emStartReport('Other')">⚠️ Other Emergency</button>
        </div>
        <div id="em-report-form" style="display:none"></div>
      </div>
      <div class="icard" style="margin:0 0 14px;background:#f8f9fa">
        <div class="icard-t">📞 Emergency Numbers</div>
        <div id="em-numbers" style="font-size:12px;color:#5f6368">Loading...</div>
      </div>
      <div class="icard" style="margin:0 0 14px;background:#f8f9fa">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="icard-t" style="margin:0">Emergency Contacts</div>
          <button class="spbtn" style="width:auto;margin:0;padding:6px 12px;font-size:11px" onclick="emShowAddContact()">+ Add Contact</button>
        </div>
        <div id="em-contact-form" style="display:none;margin-bottom:8px"></div>
        ${contacts.length ? contacts.map(c => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f3f4;font-size:12px"><span>${c.name} <span style="color:#9aa0a6">(${c.relationship_label || '—'})</span></span><span>📞 ${c.mobile}</span></div>`).join('') : '<div style="color:#9aa0a6;font-size:12px">No emergency contacts added yet.</div>'}
      </div>
      <div class="icard-t" style="padding:0 4px">My Emergency Reports</div>
      ${mine.length ? mine.map(e => `
        <div class="icard" style="margin:0 0 10px;background:#f8f9fa">
          <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700"><span>${e.code} · ${e.emergency_type}</span><span>${e.status}</span></div>
          <div style="height:6px;background:#e8eaed;border-radius:3px;margin-top:8px;overflow:hidden"><div style="height:100%;width:${e.overall_pct}%;background:${e.overall_pct === 100 ? '#137333' : '#EA4335'}"></div></div>
        </div>`).join('') : '<div style="color:#9aa0a6;font-size:13px;padding:10px 0">No emergency reports yet.</div>'}`;

    API.emergencyNumbers().then(nums => {
      document.getElementById('em-numbers').innerHTML = nums.map(n => `<div style="display:flex;justify-content:space-between;padding:3px 0"><span>${n.label}</span><b>${n.number}</b></div>`).join('');
    }).catch(() => {});
  } catch (e) {
    body.innerHTML = `<div style="color:#c5221f;padding:16px">Could not load emergency data: ${e.message}</div>`;
  }
}

function emStartReport(type) {
  const form = document.getElementById('em-report-form');
  form.style.display = 'block';
  emergencyLoc = null; emergencyPhotoUrl = null;
  form.innerHTML = `
    <div style="border-top:1px solid #f3c6c1;padding-top:10px;margin-top:6px">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">${type}</div>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:8px;cursor:pointer"><input type="checkbox" id="em-witness"> I am witnessing this (not the patient)</label>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button class="mbtn-cancel" style="flex:1;padding:8px;font-size:11px" onclick="emUseGPS()">📍 Use My Location</button>
        <button class="mbtn-cancel" style="flex:1;padding:8px;font-size:11px" onclick="emPinOnMap()">📌 Pin on Map</button>
      </div>
      <div id="em-loc-result" style="font-size:11px;color:#5f6368;margin-bottom:8px"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <label style="font-size:11px">People Affected<input type="number" id="em-people" class="spinp" value="1" min="1" style="margin:2px 0 0"></label>
        <div></div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer"><input type="checkbox" id="em-unconscious"> Unconscious</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer"><input type="checkbox" id="em-bleeding"> Bleeding</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer"><input type="checkbox" id="em-ambulance"> Ambulance needed</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer"><input type="checkbox" id="em-blocked"> Road blocked</label>
      </div>
      <input type="file" id="em-photo" accept="image/*" style="margin-bottom:8px" onchange="emPhotoUpload()">
      <textarea class="rpt-ta" id="em-desc" placeholder="Brief description (optional)" style="margin-bottom:8px"></textarea>
      <button class="mbtn-ok" style="width:100%;padding:12px;background:#c5221f" onclick="emSubmit('${type}')">🚨 SEND EMERGENCY ALERT</button>
    </div>`;
}

function emUseGPS() {
  if (!navigator.geolocation) { toast('⚠️ GPS not available'); return; }
  document.getElementById('em-loc-result').textContent = 'Getting location...';
  navigator.geolocation.getCurrentPosition(async pos => await emSetPin(pos.coords.latitude, pos.coords.longitude),
    () => { document.getElementById('em-loc-result').innerHTML = '<span style="color:#c5221f">Could not get GPS</span>'; });
}
function emPinOnMap() {
  emergencyPinMode = true;
  document.getElementById('rptpanel')?.style && (document.getElementById('ccpanel').style.display = 'none');
  toast('📌 Tap the map to pin the emergency location');
}
async function emSetPin(lat, lon) {
  emergencyPinMode = false;
  document.getElementById('ccpanel').style.display = 'flex';
  if (emergencyPinMk) map.removeLayer(emergencyPinMk);
  emergencyPinMk = L.marker([lat, lon], { icon: mkIcon('#c5221f', 18) }).addTo(map);
  map.setView([lat, lon], Math.max(map.getZoom(), 16));
  let label = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  try { const rev = await API.reverseGeocode(lat, lon); if (rev?.display_name) label = rev.display_name.split(',').slice(0, 3).join(', '); } catch (e) {}
  emergencyLoc = { lat, lon, label };
  const resEl = document.getElementById('em-loc-result');
  if (resEl) resEl.innerHTML = `📍 <b>${label}</b>`;
}
async function emPhotoUpload() {
  const input = document.getElementById('em-photo');
  if (!input.files.length) return;
  toast('📤 Uploading...');
  try { emergencyPhotoUrl = (await API.uploadPhoto(input.files[0])).url; toast('✅ Photo attached'); }
  catch (e) { toast('⚠️ Upload failed'); }
}
async function emSubmit(type) {
  try {
    const res = await API.reportEmergency({
      emergency_type: type,
      is_witness: document.getElementById('em-witness').checked,
      lat: emergencyLoc?.lat, lon: emergencyLoc?.lon, address_label: emergencyLoc?.label,
      description: document.getElementById('em-desc').value.trim(),
      photo_url: emergencyPhotoUrl,
      people_affected: parseInt(document.getElementById('em-people').value) || 1,
      unconscious: document.getElementById('em-unconscious').checked,
      bleeding: document.getElementById('em-bleeding').checked,
      ambulance_required: document.getElementById('em-ambulance').checked,
      road_blocked: document.getElementById('em-blocked').checked,
    });
    toast(`🚨 Emergency reported (${res.code}) — Emergency Center notified`);
    if (emergencyPinMk) { map.removeLayer(emergencyPinMk); emergencyPinMk = null; }
    ccTab('emergency-citizen');
  } catch (e) { toast('⚠️ Could not report emergency: ' + e.message); }
}

function emShowAddContact() {
  const form = document.getElementById('em-contact-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  form.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
      <input class="spinp" id="em-c-name" placeholder="Name" style="margin:0">
      <input class="spinp" id="em-c-rel" placeholder="Relationship" style="margin:0">
      <input class="spinp" id="em-c-mobile" placeholder="Mobile" style="margin:0">
    </div>
    <button class="spbtn" onclick="emAddContact()">Save Contact</button>`;
}
async function emAddContact() {
  try {
    await API.addEmergencyContact({
      name: document.getElementById('em-c-name').value.trim(),
      relationship_label: document.getElementById('em-c-rel').value.trim(),
      mobile: document.getElementById('em-c-mobile').value.trim(),
    });
    toast('✅ Contact added');
    ccTab('emergency-citizen');
  } catch (e) { toast('⚠️ ' + e.message); }
}

// ────────────────────────────────────────────────────────────────
// MEDICAL EMERGENCY CENTER — operator dashboard
// ────────────────────────────────────────────────────────────────
async function renderEmergencyCenterTab(body) {
  try {
    const active = await API.activeEmergencies();
    const pColor = p => p === 'Critical' ? '#c5221f' : p === 'High' ? '#d84315' : p === 'Medium' ? '#b06000' : '#137333';
    const counts = { Critical: 0, High: 0, Medium: 0, Normal: 0 };
    active.forEach(e => counts[e.priority] = (counts[e.priority] || 0) + 1);
    body.innerHTML = `
      <div class="ptrow" style="margin-bottom:14px">
        <div class="ptcell"><div class="ptv ch">${counts.Critical}</div><div class="ptl">Critical</div></div>
        <div class="ptcell"><div class="ptv" style="color:#d84315">${counts.High}</div><div class="ptl">High</div></div>
        <div class="ptcell"><div class="ptv cm">${counts.Medium}</div><div class="ptl">Medium</div></div>
        <div class="ptcell"><div class="ptv cf">${counts.Normal}</div><div class="ptl">Normal</div></div>
      </div>
      <div class="icard-t" style="padding:0 4px">Active Emergencies (${active.length})</div>
      ${active.length ? active.map(e => `
        <div class="icard" style="margin:0 0 10px;background:#f8f9fa;cursor:pointer" onclick="emOpenDetail(${e.id})">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><b style="color:${pColor(e.priority)}">${e.priority}</b> · ${e.code} · ${e.emergency_type}</div>
            <div style="font-size:11px;color:#5f6368">${e.status}</div>
          </div>
          <div style="font-size:11px;color:#5f6368;margin-top:4px">📍 ${e.address_label || `${e.lat},${e.lon}`} · ${e.people_affected} affected · Reporter: ${e.reporter_name}</div>
          <div style="height:5px;background:#e8eaed;border-radius:3px;margin-top:6px;overflow:hidden"><div style="height:100%;width:${e.overall_pct}%;background:var(--blue)"></div></div>
        </div>`).join('') : '<div style="color:#137333;font-size:13px;padding:16px;text-align:center">✅ No active emergencies.</div>'}
      <div id="em-detail-panel" style="display:none"></div>`;
  } catch (e) {
    body.innerHTML = `<div style="color:#c5221f;padding:16px">Could not load emergency center: ${e.message}</div>`;
  }
}

async function emOpenDetail(id) {
  const panel = document.getElementById('em-detail-panel');
  panel.style.display = 'block';
  panel.innerHTML = `<div class="sdrop-info"><div class="spin"></div>Loading...</div>`;
  panel.scrollIntoView({ behavior: 'smooth' });
  try {
    const [emergency, units, updates] = await Promise.all([
      fetch(`${API.getBase()}/api/v1/emergency/${id}`, { headers: { Authorization: 'Bearer ' + API.getToken() } }).then(r => r.json()),
      API.availableUnits(), API.emergencyUpdates(id)
    ]);
    panel.innerHTML = `
      <div class="icard" style="margin:14px 0 0;background:#fff;border:2px solid var(--blue)">
        <div class="icard-t">${emergency.code} — ${emergency.emergency_type} (${emergency.priority})</div>
        <div style="font-size:12px;color:#5f6368;margin-bottom:10px">Reporter: ${emergency.reporter_name} (${emergency.reporter_urbanguard_id || '—'}) · ${emergency.people_affected} affected
          ${emergency.unconscious ? ' · Unconscious' : ''}${emergency.bleeding ? ' · Bleeding' : ''}${emergency.road_blocked ? ' · Road blocked' : ''}</div>

        <div style="display:flex;gap:8px;margin-bottom:10px">
          <select id="em-status-select" class="spinp" style="margin:0">
            ${['New', 'Acknowledged', 'Response Assigned', 'Responding', 'Arrived', 'Assistance Provided', 'Resolved', 'Invalid Report', 'Duplicate', 'Transferred', 'Cancelled'].map(s => `<option ${s === emergency.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <button class="spbtn" style="width:auto;margin:0;padding:9px 14px" onclick="emUpdateStatus(${id})">Update</button>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:10px">
          <select id="em-unit-select" class="spinp" style="margin:0">${units.map(u => `<option value="${u.id}">${u.call_sign}</option>`).join('')}</select>
          <input class="spinp" id="em-eta" type="number" placeholder="ETA (min)" style="margin:0;width:100px">
          <button class="spbtn" style="width:auto;margin:0;padding:9px 14px" onclick="emAssign(${id})">Assign</button>
        </div>

        <div class="icard-t" style="padding:0">Partial Resolution</div>
        ${['response', 'traffic_control', 'team_arrived', 'patient_assistance', 'road_clearance'].map(k => `
          <div style="display:flex;align-items:center;gap:8px;margin:4px 0">
            <span style="font-size:11px;width:120px">${k.replace('_', ' ')}</span>
            <input type="range" min="0" max="100" value="${emergency['pct_' + k]}" id="em-pct-${k}" style="flex:1" oninput="document.getElementById('em-pct-${k}-val').textContent=this.value">
            <span id="em-pct-${k}-val" style="font-size:11px;width:30px">${emergency['pct_' + k]}</span>
          </div>`).join('')}
        <button class="spbtn" onclick="emUpdateResolution(${id})">Save Resolution %</button>

        <button class="mbtn-cancel" style="width:100%;padding:9px;margin-top:8px;font-size:12px" onclick="emFlagInfra(${id})">🏗️ Flag as Infrastructure Issue</button>

        <div class="icard-t" style="padding:0;margin-top:10px">Timeline</div>
        ${updates.map(u => `<div style="font-size:11px;color:#5f6368;padding:4px 0;border-bottom:1px solid #f1f3f4"><b>${u.status || 'Note'}</b> — ${u.note || ''} <span style="color:#9aa0a6">(${u.operator_name}, ${new Date(u.created_at).toLocaleTimeString()})</span></div>`).join('')}
      </div>`;
  } catch (e) {
    panel.innerHTML = `<div style="color:#c5221f;padding:8px">${e.message}</div>`;
  }
}
async function emUpdateStatus(id) {
  try { await API.updateEmergencyStatus(id, document.getElementById('em-status-select').value); toast('✅ Status updated'); ccTab('emergency-center'); }
  catch (e) { toast('⚠️ ' + e.message); }
}
async function emAssign(id) {
  try {
    const unitId = parseInt(document.getElementById('em-unit-select').value);
    const eta = parseInt(document.getElementById('em-eta').value) || null;
    await API.assignUnit(id, unitId, eta);
    toast('✅ Unit assigned'); ccTab('emergency-center');
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function emUpdateResolution(id) {
  try {
    const payload = {};
    ['response', 'traffic_control', 'team_arrived', 'patient_assistance', 'road_clearance'].forEach(k => {
      payload['pct_' + k] = parseInt(document.getElementById(`em-pct-${k}`).value);
    });
    const res = await API.updateResolution(id, payload);
    toast(res.status === 'Resolved' ? '✅ All components complete — emergency auto-resolved!' : '✅ Resolution updated');
    ccTab('emergency-center');
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function emFlagInfra(id) {
  try { await API.flagInfrastructure(id); toast('✅ Forwarded to Municipality as an infrastructure incident'); ccTab('emergency-center'); }
  catch (e) { toast('⚠️ ' + e.message); }
}// FORCE GIT UPDATE
