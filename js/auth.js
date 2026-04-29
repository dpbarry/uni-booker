// Dean Barry, Mariana Diaz Betancourt

import {
    API_BASE,
    appendPage,
    AUTH_PAGE_URL,
    authKey,
    getAllUsers,
    getUser,
    loadPage,
    setUser,
    syncThemeToggleTitles,
} from './global.js';
import { escapeHtml, initialsFromEmail } from './format.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let formBound = false;

const renderSavedAccounts = (onSignIn) => {
    const wrap = document.getElementById('auth-accounts');
    if (!wrap) return;
    const users = getAllUsers();
    if (users.length < 1) {
        wrap.hidden = true;
        wrap.innerHTML = '';
        return;
    }
    const currentEmail = getUser()?.email ?? null;
    wrap.hidden = false;
    wrap.innerHTML = `<div class="auth-accounts-inner">${users
        .map((u) => {
            const emailAttr = escapeHtml(u.email);
            const initials = escapeHtml(initialsFromEmail(u.email));
            const isCurrent = currentEmail === u.email;
            return `<button type="button" class="auth-account-chip press${isCurrent ? ' is-current' : ''}" data-email="${emailAttr}" aria-label="Sign in as ${emailAttr}" title="${emailAttr}">${initials}</button>`;
        })
        .join('')}</div>`;

    wrap.onclick = (e) => {
        const btn = e.target.closest('.auth-account-chip');
        if (!btn || !wrap.contains(btn)) return;
        const email = btn.dataset.email;
        const target = getAllUsers().find((x) => x.email === email);
        if (!target) return;
        setUser(target);
        sessionStorage.setItem(authKey, '1');
        onSignIn();
    };
};

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
        const registerBtn = document.getElementById('auth-register-button');

        const setError = (fieldId, msg) => {
            const input = document.getElementById(fieldId);
            const warning = document.getElementById(`warning-${fieldId}`);
            input.classList.toggle('has-error', Boolean(msg));
            warning.textContent = msg || '';
            warning.style.opacity = msg ? '1' : '0';
        };

        const clearErrorOnInput = (e) => setError(e.target.id, '');
        emailInput.addEventListener('input', clearErrorOnInput);
        passwordInput.addEventListener('input', clearErrorOnInput);

        const validate = (email, password) => {
            const lower = email.toLowerCase();
            if (!email) {
                setError('auth-email', 'Required');
                return false;
            }
            if (!EMAIL_RE.test(email)) {
                setError('auth-email', 'Invalid format');
                return false;
            }
            if (!lower.endsWith('@mcgill.ca') && !lower.endsWith('@mail.mcgill.ca')) {
                setError('auth-email', 'Use McGill email');
                return false;
            }
            if (!password) {
                setError('auth-password', 'Required');
                return false;
            }
            return true;
        };

        const showServerErr = (msg) => {
            const l = msg.toLowerCase();
            if (l.includes('password')) setError('auth-password', msg);
            else setError('auth-email', msg);
        };

        const submit = async (path, failMsg) => {
            setError('auth-email', '');
            setError('auth-password', '');
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            if (!validate(email, password)) return;

            try {
                const res = await fetch(`${API_BASE}${path}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });
                const data = await res.json();
                if (!res.ok) return showServerErr(data.error || failMsg);
                setUser(data);
                sessionStorage.setItem(authKey, '1');
                onSignIn();
            } catch {
                showServerErr('Could not reach server');
            }
        };

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            void submit('/login', 'Sign in failed');
        });

        registerBtn.addEventListener('click', () => {
            void submit('/register', 'Registration failed');
        });

        const forgotBtn = document.getElementById('auth-forgot-button');
        forgotBtn?.addEventListener('click', async () => {
            const email = emailInput.value.trim();
            if (!email) {
                setError('auth-email', 'Enter your email first');
                return;
            }
            if (!EMAIL_RE.test(email)) {
                setError('auth-email', 'Invalid format');
                return;
            }
            try {
                forgotBtn.disabled = true;
                const res = await fetch(`${API_BASE}/password-reset/request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                });
                const data = await res.json();
                if (!res.ok) {
                    setError('auth-email', data.error || 'Failed to send reset email');
                    return;
                }
                setError('auth-email', '');
                const warning = document.getElementById('warning-auth-email');
                warning.textContent = 'Reset email sent!';
                warning.style.opacity = '1';
                warning.style.color = 'green';
            } catch {
                setError('auth-email', 'Could not reach server');
            } finally {
                forgotBtn.disabled = false;
            }
        });
    }

    renderSavedAccounts(onSignIn);
    syncThemeToggleTitles();
};
