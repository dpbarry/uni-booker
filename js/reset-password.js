// Mariana Diaz Betancourt

import { apiFetch, authKey, userKey } from './global.js';
import { showToast } from './toast.js';

export const openResetPage = async (token) => {
    const container = document.querySelector('.reset-inner');
    if (!container) return;

    container.innerHTML = `
        <div class="reset-header">
            <h2 class="reset-title">Set a new password</h2>
            <p class="reset-subtitle">Enter your new password below</p>
        </div>
        <div class="reset-form">
            <div class="auth-field">
                <label class="auth-label" for="reset-password">New password</label>
                <input type="password" id="reset-password" class="auth-input" placeholder="New password" />
                <span class="reset-field-error" id="reset-password-error"></span>
            </div>
            <div class="auth-field">
                <label class="auth-label" for="reset-password-confirm">Confirm password</label>
                <input type="password" id="reset-password-confirm" class="auth-input" placeholder="Confirm password" />
                <span class="reset-field-error" id="reset-confirm-error"></span>
            </div>
            <p class="reset-error" hidden></p>
            <button type="button" class="auth-action-button auth-signin-button press" id="reset-submit-btn">Update password</button>
        </div>
    `;

    const passwordInput = container.querySelector('#reset-password');
    const confirmInput = container.querySelector('#reset-password-confirm');
    const errorEl = container.querySelector('.reset-error');
    const submitBtn = container.querySelector('#reset-submit-btn');
    const passwordError = container.querySelector('#reset-password-error');
    const confirmError = container.querySelector('#reset-confirm-error');

    passwordInput.addEventListener('input', () => { passwordError.textContent = ''; });
    confirmInput.addEventListener('input', () => { confirmError.textContent = ''; });

    submitBtn.addEventListener('click', async () => {
        const password = passwordInput.value;
        const confirm = confirmInput.value;

        passwordError.textContent = '';
        confirmError.textContent = '';
        errorEl.hidden = true;

        if (!password) {
            passwordError.textContent = 'Required';
            return;
        }
        if (!confirm) {
            confirmError.textContent = 'Required';
            return;
        }
        if (password !== confirm) {
            confirmError.textContent = 'Passwords do not match';
            return;
        }

        submitBtn.disabled = true;
        try {
            await apiFetch('/password-reset/confirm', {
                method: 'POST',
                body: { token, password },
            });
            sessionStorage.removeItem(authKey);
            sessionStorage.removeItem(userKey);
            location.replace('#/signin');
        } catch (err) {
            errorEl.textContent = err.message || 'Something went wrong';
            errorEl.hidden = false;
        } finally {
            submitBtn.disabled = false;
        }
    });
};
