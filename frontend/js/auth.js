/**
 * ============================================================================
 * Chemical Storage Room - Authentication Controller
 * Handles user sign in, registration, session storage, and 1-click demo login.
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // If user already authenticated, redirect to dashboard
    const existingUser = sessionStorage.getItem('chem_auth_user') || localStorage.getItem('chem_auth_user');
    if (existingUser) {
        try {
            const parsed = JSON.parse(existingUser);
            if (parsed && parsed.username) {
                window.location.replace('index.html');
                return;
            }
        } catch (e) {}
    }

    // DOM Elements
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const alertBox = document.getElementById('auth-alert');
    const alertMsg = document.getElementById('alert-message');

    const inputLoginUser = document.getElementById('login-username');
    const inputLoginPass = document.getElementById('login-password');
    const checkRemember = document.getElementById('remember-me');
    const btnLoginSubmit = document.getElementById('btn-login-submit');

    const inputRegName = document.getElementById('reg-name');
    const inputRegBadge = document.getElementById('reg-badge');
    const selectRegRole = document.getElementById('reg-role');
    const inputRegUser = document.getElementById('reg-username');
    const inputRegPass = document.getElementById('reg-password');
    const btnRegSubmit = document.getElementById('btn-reg-submit');

    // Show/Hide Alert Message
    function showAlert(msg, isError = true) {
        alertMsg.textContent = msg;
        alertBox.className = isError ? 'auth-alert auth-alert-error show' : 'auth-alert auth-alert-success show';
    }

    function hideAlert() {
        alertBox.className = 'auth-alert';
    }

    // Tab Switching
    tabLogin?.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        formLogin.classList.remove('hidden');
        formRegister.classList.add('hidden');
        hideAlert();
    });

    tabRegister?.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        formRegister.classList.remove('hidden');
        formLogin.classList.add('hidden');
        hideAlert();
    });

    // Toggle Password Visibility
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (input) {
                const isPass = input.type === 'password';
                input.type = isPass ? 'text' : 'password';
                btn.textContent = isPass ? '👁️' : '🔒';
            }
        });
    });

    // Handle Login Submit
    formLogin?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert();

        const username = inputLoginUser.value.trim();
        const password = inputLoginPass.value;

        if (!username || !password) {
            showAlert('Please enter both Operator ID / Username and Password.');
            return;
        }

        btnLoginSubmit.disabled = true;
        btnLoginSubmit.innerHTML = '<span>Verifying Credentials...</span>';

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (res.ok && data.status === 'success') {
                showAlert(`Access Authorized: Welcome, ${data.user.full_name}!`, false);

                // Save session
                const payload = JSON.stringify(data.user);
                sessionStorage.setItem('chem_auth_user', payload);
                if (data.token) sessionStorage.setItem('chem_auth_token', data.token);

                if (checkRemember && checkRemember.checked) {
                    localStorage.setItem('chem_auth_user', payload);
                    if (data.token) localStorage.setItem('chem_auth_token', data.token);
                }

                setTimeout(() => {
                    window.location.replace('index.html');
                }, 600);
            } else {
                showAlert(data.message || 'Access Denied: Invalid credentials provided.');
                btnLoginSubmit.disabled = false;
                btnLoginSubmit.innerHTML = '<span>Authorize &amp; Enter Virtual Bay</span> <span>→</span>';
            }
        } catch (err) {
            showAlert('Connection Error: Unable to communicate with authentication server.');
            btnLoginSubmit.disabled = false;
            btnLoginSubmit.innerHTML = '<span>Authorize &amp; Enter Virtual Bay</span> <span>→</span>';
        }
    });

    // Handle Registration Submit
    formRegister?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert();

        const full_name = inputRegName.value.trim();
        const badge_id = inputRegBadge.value.trim();
        const role = selectRegRole.value;
        const username = inputRegUser.value.trim();
        const password = inputRegPass.value;

        if (!username || !password || !full_name) {
            showAlert('All required fields must be completed.');
            return;
        }

        btnRegSubmit.disabled = true;
        btnRegSubmit.innerHTML = '<span>Registering Operator...</span>';

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name, badge_id, role, username, password })
            });

            const data = await res.json();

            if (res.ok && data.status === 'success') {
                showAlert(`Personnel Registered! Welcome, ${data.user.full_name}. Entering platform...`, false);

                const payload = JSON.stringify(data.user);
                sessionStorage.setItem('chem_auth_user', payload);
                if (data.token) sessionStorage.setItem('chem_auth_token', data.token);

                setTimeout(() => {
                    window.location.replace('index.html');
                }, 700);
            } else {
                showAlert(data.message || 'Registration failed. Please check inputs.');
                btnRegSubmit.disabled = false;
                btnRegSubmit.innerHTML = '<span>Register &amp; Access Platform</span> <span>→</span>';
            }
        } catch (err) {
            showAlert('Connection Error: Unable to reach registration server.');
            btnRegSubmit.disabled = false;
            btnRegSubmit.innerHTML = '<span>Register &amp; Access Platform</span> <span>→</span>';
        }
    });

    // 1-Click Quick Demo Accounts
    document.querySelectorAll('.demo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const u = btn.dataset.user;
            const p = btn.dataset.pass;
            if (u && p) {
                // Switch to login tab if on register
                tabLogin?.click();
                inputLoginUser.value = u;
                inputLoginPass.value = p;
                // Auto trigger login submit
                formLogin?.requestSubmit();
            }
        });
    });
});

