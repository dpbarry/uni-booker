import { AUTH_PAGE_URL, appendPage, authKey, loadPage, setUser, syncThemeToggleTitles } from './global.js';

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

        const submitLogin = async () => {
            const emailInput = document.getElementById('auth-email');
            const email = emailInput?.value.trim();
            // NOTE: backend has no password column yet — password input is collected
            // for UX but not sent. Add a /register + password hashing endpoint later.
            if (!email) {
                alert('Please enter your email.');
                return;
            }
            try {
                const response = await fetch('http://localhost:3000/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                });
                const data = await response.json();
                if (!response.ok) {
                    alert(data.error || 'Sign in failed');
                    return;
                }
                setUser(data);
                sessionStorage.setItem(authKey, '1');
                onSignIn();
            } catch (err) {
                console.error('Login error:', err);
                alert('Server error');
            }
        };

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            void submitLogin();
        });

        // TODO: wire to a real /register endpoint when the backend exposes one.
        const registerBtn = document.getElementById('auth-register-button');
        registerBtn?.addEventListener('click', () => {
            alert('Registration is not available yet. Please sign in with an existing email.');
        });
    }

    syncThemeToggleTitles();
};
