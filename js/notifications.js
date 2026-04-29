// Zheng Ye, Dean Barry

import { apiFetch, getUser } from './global.js';
import { createDialog, openDialog } from './dialog.js';
import { escapeHtml, formatClockTime, formatShortDate } from './format.js';
import { showToast } from './toast.js';

const renderRequests = (requests) => {
    if (!requests.length) return `<li class="notif-empty">No pending meeting requests.</li>`;

    return requests.map((r) => `
        <li class="notif-request-row" data-id="${r.id}">
            <div class="notif-request-meta">
                <span class="notif-request-email">${escapeHtml(r.student_email)}</span>
                <span class="notif-request-when">${formatShortDate(r.date)} at ${formatClockTime(r.time)}</span>
            </div>
            ${r.message ? `
            <div class="notif-request-note-wrap">
                <span class="notif-request-note-label">Note</span>
                <p class="notif-request-note">${escapeHtml(r.message)}</p>
            </div>
            ` : ''}
            <label class="notif-slot-name-wrap">
                <span class="notif-slot-name-label">Name (optional)</span>
                <input
                    type="text"
                    class="notif-slot-name-input"
                    data-slot-name-input
                    maxlength="80"
                />
            </label>
            
            <div class="notif-request-actions">
                <button type="button" class="primary-button press notif-action-btn notif-action-accept" data-action="accept-request" data-id="${r.id}">
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><use href="assets/icons.svg#check" /></svg>
                    <span>Accept</span>
                </button>
                <button type="button" class="primary-button-ghost press notif-action-btn notif-action-decline" data-action="decline-request" data-id="${r.id}">
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><use href="assets/icons.svg#x" /></svg>
                    <span>Decline</span>
                </button>
            </div>
        </li>
    `).join('');
};

const updateDot = (count) => {
    const dot = document.querySelector('.notif-bell .notif-dot');
    if (dot) dot.hidden = count === 0;
};

export const refreshNotifications = async () => {
    const user = getUser();
    if (!user || user.role !== 'owner') return;

    const requests = await apiFetch(`/requests/owner/${user.id}`);
    updateDot(requests.length);
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

                <ul class="notif-request-list">${renderRequests(requests)}</ul>
            </div>
        `,
    });

    dialog.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action="accept-request"], [data-action="decline-request"]');
        if (!btn) return;

        const accepted = btn.dataset.action === 'accept-request';
        const id = Number(btn.dataset.id);
        const row = btn.closest('.notif-request-row');
        const slotName = accepted? String(row?.querySelector('[data-slot-name-input]')?.value || '').trim(): '';
        btn.disabled = true;

        try {
            await apiFetch(`/requests/${id}`, {
                method: 'PATCH',
                body: {
                    status: accepted ? 'accepted' : 'declined',
                    slot_name: accepted ? slotName : null,
                },
            });
            const updated = await apiFetch(`/requests/owner/${user.id}`);
            dialog.querySelector('.notif-request-list').innerHTML = renderRequests(updated);
            updateDot(updated.length);
            showToast({ content: `<span>${accepted ? 'Request accepted' : 'Request declined'}</span>`, timeout: 2000 });
            if (accepted) window.dispatchEvent(new CustomEvent('booking-changed'));
        } catch (err) {
            btn.disabled = false;
            showToast({ content: `<span>${err.message || 'Something went wrong'}</span>`, timeout: 2000, variant: 'error' });
        }
    });

    openDialog(dialog);
};
