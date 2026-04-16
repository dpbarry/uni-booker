import { API_BASE, AUTH_PAGE_URL, appendPage, authKey, loadPage, setUser, syncThemeToggleTitles } from './global.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let formBound = false;

export const ensureAuthPage = async (pageContainer, onSignIn, { append = false } = {}) => {
    if (!document.getElementById('view-auth')) {
        if (append) {
            await appendPage(pageContainer, AUTH_PAGE_URL);
            const authView = document.getElementById('view-auth');
            authView.classList.remove('is-visible');
            authView.classList.add('from-signout-layer');
        } else {
            await loadPage(pageContainer, AUTH_PAGE_URL);
        }
        formBound = false;
    }

    const form = document.getElementById('auth-form');
    if (form && !formBound) {
        formBound = true;

        const emailInput = document.getElementById('auth-email');
        const passwordInput = document.getElementById('auth-password');
        const signinBtn = document.getElementById('auth-signin-button');
        const registerBtn = document.getElementById('auth-register-button');

        const setError = (fieldId, msg) => {
            const input = document.getElementById(fieldId);
            const warning = document.getElementById(`warning-${fieldId}`);
            if (input) input.classList.add('has-error');
            if (warning) {
                warning.textContent = msg || '';
                warning.style.opacity = msg ? '1' : '0';
            }
        };

        const clearError = (fieldId) => {
            const input = document.getElementById(fieldId);
            const warning = document.getElementById(`warning-${fieldId}`);
            if (input) input.classList.remove('has-error');
            if (warning) warning.style.opacity = '0';
        };

        const clearAllErrors = () => {
            clearError('auth-email');
            clearError('auth-password');
        };

        const clearWarningOnChange = (e) => {
            clearError(e.target.id);
        };

        emailInput?.addEventListener('input', clearWarningOnChange);
        passwordInput?.addEventListener('input', clearWarningOnChange);

        const getFields = () => ({
            email: emailInput?.value.trim(),
            password: passwordInput?.value,
        });

        const validate = ({ email, password }) => {
            let isValid = true;
            if (!email) { setError('auth-email', 'Required'); isValid = false; }
            else if (!EMAIL_RE.test(email)) { setError('auth-email', 'Invalid format'); isValid = false; }
            else {
                const lower = email.toLowerCase();
                if (!lower.endsWith('@mcgill.ca') && !lower.endsWith('@mail.mcgill.ca')) {
                    setError('auth-email', 'Use McGill email');
                    isValid = false;
                }
            }

            if (!password) { setError('auth-password', 'Required'); isValid = false; }
            return isValid;
        };

        const handleServerErr = (msg) => {
            const l = (msg || '').toLowerCase();
            if (l.includes('password')) setError('auth-password', msg);
            else if (l.includes('email') || l.includes('user') || l.includes('registered')) setError('auth-email', msg);
            else { setError('auth-email', msg); setError('auth-password', ''); }
        };

        const submitLogin = async () => {
            clearAllErrors();
            const fields = getFields();
            if (!validate(fields)) return;

            try {
                const res = await fetch(`${API_BASE}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: fields.email, password: fields.password }),
                });
                const data = await res.json();
                if (!res.ok) { handleServerErr(data.error || 'Sign in failed'); return; }

                setUser(data);
                sessionStorage.setItem(authKey, '1');
                onSignIn();
            } catch {
                handleServerErr('Could not reach server');
            }
        };

        const submitRegister = async () => {
            clearAllErrors();
            const fields = getFields();
            if (!validate(fields)) return;

            try {
                const res = await fetch(`${API_BASE}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: fields.email, password: fields.password }),
                });
                const data = await res.json();
                if (!res.ok) { handleServerErr(data.error || 'Registration failed'); return; }

                setUser(data);
                sessionStorage.setItem(authKey, '1');
                onSignIn();
            } catch {
                handleServerErr('Could not reach server');
            }
        };

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            void submitLogin();
        });

        registerBtn?.addEventListener('click', () => {
            void submitRegister();
        });
    }

    syncThemeToggleTitles();
};
