import { apiFetch, getUser } from './global.js';
import { createDialog, openDialog, requestDialogClose } from './dialog.js';
import { escapeHtml, formatClockTime, formatShortDate } from './format.js';
import { showToast } from './toast.js';

const renderRequests = (requests, dialog) => {
    if (!requests.length) {
        return `<p class="booking-empty">No pending meeting requests.</p>`;
    }
    return requests.map((r) => `
        <li class="notif-request-row" data-id="${r.id}">
            <div class="notif-request-info">
                <span class="notif-request-email">${escapeHtml(r.student_email)}</span>
                <span class="notif-request-when">${formatShortDate(r.date)} at ${formatClockTime(r.time)}</span>
                ${r.message ? `<span class="notif-request-message">${escapeHtml(r.message)}</span>` : ''}
            </div>
            <div class="notif-request-actions">
                <button type="button" class="primary-button press" data-action="accept-request" data-id="${r.id}">Accept</button>
                <button type="button" class="primary-button-ghost press" data-action="decline-request" data-id="${r.id}">Decline</button>
            </div>
        </li>
    `).join('');
};

export const refreshNotifications = async () => {
    const user = getUser();
    if (!user || user.role !== 'owner') return;

    const requests = await apiFetch(`/requests/owner/${user.id}`);
    const dot = document.querySelector('.notif-bell .notif-dot');
    if (dot) dot.hidden = requests.length === 0;
};

export const openNotificationsDialog = async () => {
    const user = getUser();
    if (!user || user.role !== 'owner') return;

    const requests = await apiFetch(`/requests/owner/${user.id}`);

    const dialog = createDialog({
        className: 'notifications-dialog',
        content: `
            <div class="dialog-form">
                <header class="dialog-header">
                    <h2 class="dialog-title">Meeting requests</h2>
                    <button type="button" class="icon-button press" data-action="close-dialog" title="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24"><use href="assets/icons.svg#x" /></svg>
                    </button>
                </header>
                <ul class="notif-request-list">
                    ${renderRequests(requests)}
                </ul>
            </div>
        `,
    });

    dialog.addEventListener('click', async (e) => {
        const acceptBtn = e.target.closest('[data-action="accept-request"]');
        const declineBtn = e.target.closest('[data-action="decline-request"]');
        const btn = acceptBtn || declineBtn;
        if (!btn) return;

        const id = Number(btn.dataset.id);
        const status = acceptBtn ? 'accepted' : 'declined';
        btn.disabled = true;

        try {
            await apiFetch(`/requests/${id}`, { method: 'PATCH', body: { status } });

            const updated = await apiFetch(`/requests/owner/${user.id}`);
            const list = dialog.querySelector('.notif-request-list');
            if (list) list.innerHTML = renderRequests(updated);

            const dot = document.querySelector('.notif-bell .notif-dot');
            if (dot) dot.hidden = updated.length === 0;

            const label = acceptBtn ? 'Request accepted' : 'Request declined';
            showToast({ content: `<span>${label}</span>`, timeout: 2200 });

            if (acceptBtn) window.dispatchEvent(new CustomEvent('booking-changed'));
        } catch (err) {
            btn.disabled = false;
            showToast({ content: `<span>${err.message || 'Something went wrong'}</span>`, timeout: 2200, variant: 'error' });
        }
    });

    openDialog(dialog);
};
