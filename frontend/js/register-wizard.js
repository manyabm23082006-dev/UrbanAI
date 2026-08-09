// ════════════════════════════════════════════════════════════════
// REGISTRATION WIZARD — step navigation, live "already registered"
// checks, real OTP verification, and pre-account document uploads.
// ════════════════════════════════════════════════════════════════
let regCurrentStep = 1;
let regOtpTicket = null;
let regOtpVerifiedFor = null;
const regUploads = {}; // doc_type -> uploaded URL

function regShowError(msg) {
  const e = document.getElementById('aerr');
  if (e) { e.textContent = msg; e.style.display = 'block'; }
}

function regGoStep(step) {
  // Guard: don't allow skipping to step 2+ without name/mobile filled
  if (step >= 2) {
    const name = document.getElementById('sn').value.trim();
    const mobile = document.getElementById('s-mobile').value.trim();
    if (!name || !mobile) { regShowError('Enter your name and mobile number first'); return; }
  }
  document.getElementById('aerr').style.display = 'none';
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`reg-step-${i}`).style.display = i === step ? 'block' : 'none';
    const dot = document.querySelector(`.reg-dot[data-step="${i}"]`);
    dot.classList.toggle('on', i === step);
    dot.classList.toggle('done', i < step);
  }
  regCurrentStep = step;
  if (step === 2) {
    document.getElementById('reg-otp-phone-display').textContent = document.getElementById('s-mobile').value.trim() || 'your number';
  }
}

// ── Live availability checks (email / mobile / govt ID / vehicle reg) ──
let availTimers = {};
function clearAvail(field) {
  const el = document.getElementById(`avail-${field}`);
  if (el) { el.textContent = ''; el.className = 'reg-avail-msg'; }
}
async function checkAvail(field) {
  const inputMap = { mobile: 's-mobile', email: 'se', govtid: 's-govtid', vehicle: 's-veh-reg' };
  const paramMap = { mobile: 'mobile', email: 'email', govtid: 'govt_id_number', vehicle: 'vehicle_reg_number' };
  const val = document.getElementById(inputMap[field]).value.trim();
  const msgEl = document.getElementById(`avail-${field}`);
  if (!val) { clearAvail(field); return; }

  clearTimeout(availTimers[field]);
  availTimers[field] = setTimeout(async () => {
    msgEl.textContent = 'Checking...'; msgEl.className = 'reg-avail-msg checking';
    try {
      const res = await API.checkAvailability({ [paramMap[field]]: val });
      const takenKey = { mobile: 'mobile_taken', email: 'email_taken', govtid: 'govt_id_taken', vehicle: 'vehicle_reg_taken' }[field];
      if (res[takenKey]) {
        const labelMap = { mobile: 'This mobile number', email: 'This email', govtid: 'This government ID number', vehicle: 'This vehicle registration number' };
        msgEl.textContent = `⚠️ ${labelMap[field]} is already registered.`;
        msgEl.className = 'reg-avail-msg taken';
      } else {
        msgEl.textContent = '✓ Available';
        msgEl.className = 'reg-avail-msg ok';
      }
    } catch (e) {
      msgEl.textContent = '';
    }
  }, 500);
}

// ── OTP verification ──
async function regSendOtp() {
  const mobile = document.getElementById('s-mobile').value.trim();
  if (!mobile) { regShowError('Enter your mobile number first'); regGoStep(1); return; }
  const btn = document.getElementById('reg-send-otp-btn');
  btn.disabled = true; btn.textContent = 'Sending...';
  try {
    const res = await API.requestOtp(mobile, 'registration');
    document.getElementById('reg-otp-send-box').style.display = 'none';
    document.getElementById('reg-otp-verify-box').style.display = 'block';
    const modeNote = res.delivery_mode === 'console'
      ? ' (Dev mode: check the server console/log for the code — no real SMS was sent.)'
      : '';
    document.getElementById('reg-otp-msg').textContent = res.message + modeNote;
    document.getElementById('reg-otp-msg').style.color = res.delivery_mode === 'console' ? '#b06000' : '#34A853';
  } catch (e) {
    regShowError(e.message);
    btn.disabled = false; btn.textContent = 'Send Verification Code';
  }
}
async function regVerifyOtp() {
  const mobile = document.getElementById('s-mobile').value.trim();
  const code = document.getElementById('reg-otp-code').value.trim();
  const msgEl = document.getElementById('reg-otp-msg');
  if (!code) { msgEl.textContent = 'Enter the code'; msgEl.style.color = '#EA4335'; return; }
  try {
    const res = await API.verifyOtp(mobile, code, 'registration');
    if (res.verified) {
      regOtpTicket = res.otp_ticket;
      regOtpVerifiedFor = mobile;
      msgEl.textContent = '✅ ' + res.message;
      msgEl.style.color = '#34A853';
      setTimeout(() => regGoStep(3), 700);
    } else {
      msgEl.textContent = res.message;
      msgEl.style.color = '#EA4335';
    }
  } catch (e) {
    msgEl.textContent = e.message;
    msgEl.style.color = '#EA4335';
  }
}
function regSkipOtp() {
  // Registration still works without OTP unless the backend has
  // OTP_REQUIRED_FOR_REGISTRATION enabled -- in which case the final
  // submit will clearly explain that verification is required.
  regGoStep(3);
}

// ── Pre-account document upload ──
async function regUploadDoc(inputEl, docType, statusElId) {
  const file = inputEl.files[0];
  const statusEl = document.getElementById(statusElId);
  if (!file) return;
  statusEl.textContent = 'Uploading...'; statusEl.className = 'reg-upload-status';
  try {
    const res = await API.uploadRegistrationDocument(docType, file);
    regUploads[docType] = res.url;
    statusEl.textContent = `✓ Uploaded: ${file.name}`;
    statusEl.className = 'reg-upload-status ok';
  } catch (e) {
    statusEl.textContent = '⚠️ ' + e.message;
    statusEl.className = 'reg-upload-status err';
  }
}
