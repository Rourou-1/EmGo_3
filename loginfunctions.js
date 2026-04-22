// ─────────────────────────────────────────────
//  Reset Form Security Flag
// ─────────────────────────────────────────────
let _resetFormActive = false;

// ─────────────────────────────────────────────
//  Tab Switching
// ─────────────────────────────────────────────
function switchTab(type) {
    const tabs      = document.querySelectorAll('.tab-btn');
    const lForm     = document.getElementById('loginForm');
    const sForm     = document.getElementById('signupForm');
    const fForm     = document.getElementById('forgotForm');
    const oForm     = document.getElementById('otpForm');
    const rForm     = document.getElementById('resetForm');
    const xForm     = document.getElementById('expiredForm');
    const tabsWrap  = document.querySelector('.auth-tabs');
    const msg       = document.getElementById('msg');

    msg.style.display = 'none';
    [lForm, sForm, fForm, oForm, rForm, xForm].forEach(f => {
        if (f) f.classList.add('hidden');
    });

    if (type === 'forgot') {
        _resetFormActive = false;
        tabsWrap.style.display = 'none';
        fForm.classList.remove('hidden');
        document.getElementById('fEmail').value = '';

    } else if (type === 'otp') {
        _resetFormActive = false;
        tabsWrap.style.display = 'none';
        oForm.classList.remove('hidden');
        initOtpBoxes();
        startResendTimer();

    } else if (type === 'reset') {
        tabsWrap.style.display = 'none';
        rForm.classList.remove('hidden');
        document.getElementById('rPass').value = '';
        document.getElementById('rPassConfirm').value = '';
        document.getElementById('strengthBar').style.width = '0%';
        document.getElementById('strengthLabel').textContent = '';
        ['rPass', 'rPassConfirm'].forEach(id => {
            const el = document.getElementById(id);
            el.oninput = () => {
                const pos     = el.selectionStart;
                const cleaned = el.value.replace(/\s/g, '');
                if (el.value !== cleaned) {
                    el.value = cleaned;
                    el.setSelectionRange(pos - 1, pos - 1);
                }
                if (id === 'rPass') updateStrength();
            };
            el.onkeydown = (e) => { if (e.key === ' ') e.preventDefault(); };
        });
        // Push a history entry so browser Back fires popstate instead of
        // navigating away — we use that to force a sign-out.
        _resetFormActive = true;
        history.pushState({ emgoStep: 'reset' }, '', location.pathname + '#reset');

    } else if (type === 'expired') {
        // "Reset session was cancelled" error panel
        _resetFormActive = false;
        tabsWrap.style.display = 'none';
        if (xForm) xForm.classList.remove('hidden');
        history.replaceState(null, '', location.pathname);

    } else {
        _resetFormActive = false;
        if (location.hash === '#reset') {
            history.replaceState(null, '', location.pathname);
        }
        tabsWrap.style.display = 'grid';
        tabs[0].classList.toggle('active', type === 'login');
        tabs[1].classList.toggle('active', type === 'signup');
        if (type === 'login') lForm.classList.remove('hidden');
        else                  sForm.classList.remove('hidden');
    }
}

// ─────────────────────────────────────────────
//  Browser Back-Button Interceptor
//  Sign out immediately if user presses Back
//  while the reset-password form is visible.
// ─────────────────────────────────────────────
window.addEventListener('popstate', async function (e) {
    if (_resetFormActive) {
        _resetFormActive = false;
        try { await emgoDb.auth.signOut(); } catch (err) { /* ignore */ }
        localStorage.removeItem('pendingPasswordReset');
        switchTab('expired');
        showMsg('⚠️ Reset session was cancelled. Sign in or start over.', 'err');
    }
});

// ─────────────────────────────────────────────
//  Signup Password — strength meter + no spaces
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const sPassEl = document.getElementById('sPass');
    sPassEl.oninput = () => {
        const pos     = sPassEl.selectionStart;
        const cleaned = sPassEl.value.replace(/\s/g, '');
        if (sPassEl.value !== cleaned) {
            sPassEl.value = cleaned;
            sPassEl.setSelectionRange(pos - 1, pos - 1);
        }
        updateSignupStrength();
    };
    sPassEl.onkeydown = (e) => { if (e.key === ' ') e.preventDefault(); };
});

function updateSignupStrength() {
    const val = document.getElementById('sPass').value;
    const bar = document.getElementById('sStrengthBar');
    const lbl = document.getElementById('sStrengthLabel');
    let score = 0;
    if (val.length >= 8)          score++;
    if (/[A-Z]/.test(val))        score++;
    if (/[0-9]/.test(val))        score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    const levels = [
        { w: '0%',   bg: 'transparent', txt: '' },
        { w: '25%',  bg: '#ef4444',      txt: '⚡ Weak' },
        { w: '50%',  bg: '#f59e0b',      txt: '🔶 Fair' },
        { w: '75%',  bg: '#38bdf8',      txt: '🔷 Good' },
        { w: '100%', bg: '#22c55e',      txt: '🔒 Strong' },
    ];
    const lvl = val.length === 0 ? levels[0] : levels[Math.min(score, 4)];
    bar.style.width      = lvl.w;
    bar.style.background = lvl.bg;
    lbl.textContent      = lvl.txt;
    lbl.style.color      = lvl.bg;
}

// ─────────────────────────────────────────────
//  Password Strength Meter (Reset form)
// ─────────────────────────────────────────────
function updateStrength() {
    const val = document.getElementById('rPass').value;
    const bar = document.getElementById('strengthBar');
    const lbl = document.getElementById('strengthLabel');
    let score = 0;
    if (val.length >= 8)          score++;
    if (/[A-Z]/.test(val))        score++;
    if (/[0-9]/.test(val))        score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    const levels = [
        { w: '0%',   bg: 'transparent', txt: '' },
        { w: '25%',  bg: '#ef4444',      txt: '⚡ Weak' },
        { w: '50%',  bg: '#f59e0b',      txt: '🔶 Fair' },
        { w: '75%',  bg: '#38bdf8',      txt: '🔷 Good' },
        { w: '100%', bg: '#22c55e',      txt: '🔒 Strong' },
    ];
    const lvl = val.length === 0 ? levels[0] : levels[Math.min(score, 4)];
    bar.style.width      = lvl.w;
    bar.style.background = lvl.bg;
    lbl.textContent      = lvl.txt;
    lbl.style.color      = lvl.bg;
}

// ─────────────────────────────────────────────
//  Handle Password Reset (after OTP verified)
// ─────────────────────────────────────────────
async function handleResetPassword() {
    const pass    = document.getElementById('rPass').value;
    const confirm = document.getElementById('rPassConfirm').value;
    if (pass.length < 8) { showMsg('Password must be at least 8 characters.', 'err'); return; }
    if (pass !== confirm) { showMsg('Passwords do not match.', 'err'); return; }

    setLoading('resetBtn', true);
    try {
        const { error } = await emgoDb.auth.updateUser({ password: pass });
        if (error) {
            showMsg(error.message, 'err');
        } else {
            // Clear flag BEFORE signing out so popstate doesn't double-trigger
            _resetFormActive = false;
            localStorage.removeItem('pendingPasswordReset');
            history.replaceState(null, '', location.pathname);
            showMsg('✅ Password updated! Redirecting…', 'ok');
            await emgoDb.auth.signOut();
            setTimeout(() => { switchTab('login'); }, 1800);
        }
    } catch (err) {
        showMsg('Unexpected error. Please try again.', 'err');
        console.error(err);
    }
    setLoading('resetBtn', false);
}

// ─────────────────────────────────────────────
//  Password Visibility Toggle
// ─────────────────────────────────────────────
function togglePass(id, btn) {
    const input  = document.getElementById(id);
    const isHide = input.type === 'password';
    input.type   = isHide ? 'text' : 'password';
    btn.innerHTML = isHide
        ? '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
        : '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
}

// ─────────────────────────────────────────────
//  Message Helper
// ─────────────────────────────────────────────
function showMsg(txt, type) {
    const msg       = document.getElementById('msg');
    msg.innerText   = txt;
    msg.className   = type === 'err' ? 'msg-err' : 'msg-ok';
    msg.style.display = 'block';
}

function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled      = loading;
    btn.style.opacity = loading ? '0.7' : '1';
}

// ─────────────────────────────────────────────
//  Redirect if already logged in
// ─────────────────────────────────────────────
const _authCard = document.querySelector('.auth-card');
if (_authCard) _authCard.style.visibility = 'hidden';

async function _checkSession() {
    try {
        const { data: { session } } = await emgoDb.auth.getSession();

        if (session) {
            const hasPendingReset = !!localStorage.getItem('pendingPasswordReset');

            if (hasPendingReset) {
                if (_authCard) _authCard.style.visibility = 'visible';
                switchTab('reset');
            } else if (location.hash === '#reset') {
                // Session exists but no OTP flow was completed — could be abuse/manipulation
                history.replaceState(null, '', location.pathname);
                await emgoDb.auth.signOut();
                if (_authCard) _authCard.style.visibility = 'visible';
                switchTab('login');
                showMsg('⚠️ Reset session expired. Please sign in or use Forgot Password.', 'err');
            } else {
                window.location.replace('index.html');
            }
        } else {
            // Not logged in — clear any stale flags
            localStorage.removeItem('pendingPasswordReset');
            if (location.hash === '#reset') {
                history.replaceState(null, '', location.pathname);
            }
            if (_authCard) _authCard.style.visibility = 'visible';
        }
    } catch (e) {
        if (_authCard) _authCard.style.visibility = 'visible';
    }
}

_checkSession();

window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
        _checkSession();
    }
});

// ─────────────────────────────────────────────
//  Sign In
// ─────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const email    = document.getElementById('lEmail').value.trim().toLowerCase();
    const password = document.getElementById('lPass').value;

    setLoading('loginBtn', true);
    try {
        const { error } = await emgoDb.auth.signInWithPassword({ email, password });
        if (error) {
            showMsg(error.message, 'err');
        } else {
            showMsg('✅ Login successful! Redirecting…', 'ok');
            setTimeout(() => { window.location.replace('index.html'); }, 900);
        }
    } catch (err) {
        showMsg('Unexpected error. Check your Supabase keys.', 'err');
        console.error(err);
    }
    setLoading('loginBtn', false);
}

// ─────────────────────────────────────────────
//  Sign Up
// ─────────────────────────────────────────────
async function handleSignup(e) {
    e.preventDefault();
    const fullName = document.getElementById('sName').value.trim();
    const email    = document.getElementById('sEmail').value.trim().toLowerCase();
    const password = document.getElementById('sPass').value;

    if (password.length < 8) { showMsg('Password must be at least 8 characters.', 'err'); return; }

    setLoading('signupBtn', true);
    try {
        const { error } = await emgoDb.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } }
        });
        if (error) {
            showMsg(error.message, 'err');
        } else {
            showMsg('📧 Check your email for a confirmation link!', 'ok');
        }
    } catch (err) {
        showMsg('Unexpected error. Check your Supabase keys.', 'err');
        console.error(err);
    }
    setLoading('signupBtn', false);
}

// ─────────────────────────────────────────────
//  Forgot Password — sends OTP code to email
// ─────────────────────────────────────────────
let _otpEmail       = '';
let _resendInterval = null;

async function handleForgotPassword() {
    const email = document.getElementById('fEmail').value.trim().toLowerCase();
    if (!email) { showMsg('Please enter your email address.', 'err'); return; }

    setLoading('forgotBtn', true);
    try {
        const { error } = await emgoDb.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: false }
        });
        if (error) {
            showMsg(error.message, 'err');
        } else {
            _otpEmail = email;
            document.getElementById('otpEmailLabel').textContent = email;
            switchTab('otp');
        }
    } catch (err) {
        showMsg('Unexpected error. Check your Supabase keys.', 'err');
        console.error(err);
    }
    setLoading('forgotBtn', false);
}

// ─────────────────────────────────────────────
//  OTP Box — keyboard UX
// ─────────────────────────────────────────────
function initOtpBoxes() {
    const boxes = Array.from(document.querySelectorAll('.otp-box'));
    boxes.forEach((box, i) => {
        box.value = '';
        box.classList.remove('filled');
        box.oninput = (e) => {
            box.value = box.value.replace(/\D/g, '').slice(-1);
            box.classList.toggle('filled', box.value !== '');
            if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
        };
        box.onkeydown = (e) => {
            if (e.key === 'Backspace' && !box.value && i > 0) {
                boxes[i - 1].value = '';
                boxes[i - 1].classList.remove('filled');
                boxes[i - 1].focus();
            }
            if (e.key === 'v' && (e.ctrlKey || e.metaKey)) return;
        };
        box.onpaste = (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData)
                .getData('text').replace(/\D/g, '').slice(0, 8);
            text.split('').forEach((ch, idx) => {
                if (boxes[idx]) { boxes[idx].value = ch; boxes[idx].classList.add('filled'); }
            });
            const next = Math.min(text.length, boxes.length - 1);
            boxes[next].focus();
        };
    });
    boxes[0].focus();
}

function getOtpValue() {
    return Array.from(document.querySelectorAll('.otp-box')).map(b => b.value).join('');
}

// ─────────────────────────────────────────────
//  Resend timer (60 s cooldown)
// ─────────────────────────────────────────────
function startResendTimer() {
    const resendBtn = document.getElementById('resendBtn');
    const timerEl   = document.getElementById('resendTimer');
    const countEl   = document.getElementById('resendCount');
    if (_resendInterval) clearInterval(_resendInterval);
    let secs = 60;
    resendBtn.disabled      = true;
    resendBtn.style.opacity = '0.4';
    timerEl.style.display   = 'inline';
    countEl.textContent     = secs;
    _resendInterval = setInterval(() => {
        secs--;
        countEl.textContent = secs;
        if (secs <= 0) {
            clearInterval(_resendInterval);
            resendBtn.disabled      = false;
            resendBtn.style.opacity = '1';
            timerEl.style.display   = 'none';
        }
    }, 1000);
}

async function handleResendOtp() {
    if (!_otpEmail) return;
    try {
        const { error } = await emgoDb.auth.signInWithOtp({
            email: _otpEmail,
            options: { shouldCreateUser: false }
        });
        if (error) showMsg(error.message, 'err');
        else { showMsg('📧 New code sent!', 'ok'); startResendTimer(); }
    } catch (err) { showMsg('Unexpected error.', 'err'); }
}

// ─────────────────────────────────────────────
//  Verify OTP → move to reset password screen
// ─────────────────────────────────────────────
async function handleVerifyOtp() {
    const token = getOtpValue();
    if (token.length < 8) { showMsg('Enter all 8 digits.', 'err'); return; }

    setLoading('otpBtn', true);
    try {
        const { error } = await emgoDb.auth.verifyOtp({
            email: _otpEmail,
            token,
            type: 'email'
        });
        if (error) {
            showMsg('Invalid or expired code. Try again or resend.', 'err');
        } else {
            localStorage.setItem('pendingPasswordReset', '1');
            switchTab('reset');
        }
    } catch (err) {
        showMsg('Unexpected error. Please try again.', 'err');
        console.error(err);
    }
    setLoading('otpBtn', false);
}