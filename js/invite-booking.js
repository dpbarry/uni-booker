import { apiFetch, getUser, ApiError } from './global.js';
import { createDialog, openDialog } from './dialog.js';
import { showToast } from './toast.js';
import { escapeHtml, formatClockTime, formatShortDate, initialFromEmail } from './format.js';

const tokenCache = new Map();

export const resolveToken = async (ownerId) => {
    if (tokenCache.has(ownerId)) return tokenCache.get(ownerId);
    const { token } = await apiFetch(`/owners/${ownerId}/invite-token`, { method: 'POST' });
    tokenCache.set(ownerId, token);
    return token;
};

const renderContent = (data, viewer) => {
    const { owner, slots } = data;
    const isOwnerViewing = viewer?.id === owner.id;
    const isOwnerRole = viewer?.role === 'owner';
    const viewOnly = isOwnerRole && !isOwnerViewing;
    const isStudent = viewer?.role === 'student';

    const headerHtml = `
        <div class="booking-header">
            <div class="booking-heading">
                <span class="prof-avatar">${initialFromEmail(owner.email)}</span>
                <div class="booking-heading-meta">
                    <span class="booking-heading-label">${isOwnerViewing ? 'Your slots' : 'Book with'}</span>
                    <span class="booking-heading-email">${escapeHtml(owner.email)}</span>
                </div>
            </div>
            <a class="booking-mailto" href="mailto:${encodeURIComponent(owner.email)}" title="Email ${escapeHtml(owner.email)}">
                <svg width="15" height="15" viewBox="0 0 24 24"><use href="assets/icons.svg#mail" /></svg>
                <span>Email</span>
            </a>
        </div>
    `;

    if (!slots.length) {
        return headerHtml + `<div class="booking-empty">No active slots available right now.</div>`;
    }

    const slotsHtml = slots.map((slot) => {
        const booked = Boolean(slot.booking_id);
        const selfBooked = booked && slot.booker_id === viewer?.id;
        const disabled = booked || isOwnerViewing || viewOnly || !viewer || !isStudent;
        const label = selfBooked
            ? 'Booked by you'
            : booked
                ? 'Booked'
                : isOwnerViewing
                    ? 'Your slot'
                    : viewOnly
                        ? 'View only'
                        : 'Book';
        const btn = selfBooked
            ? `<button type="button" class="primary-button-ghost press" data-action="cancel-booking" data-booking-id="${slot.booking_id}">Cancel</button>`
            : `<button type="button" class="primary-button press" data-action="book-slot" data-slot-id="${slot.id}"${disabled ? ' disabled' : ''}>${label}</button>`;
        return `
            <li class="booking-slot${booked ? ' is-booked' : ''}" data-slot-id="${slot.id}">
                <div class="booking-slot-when">
                    <span class="booking-slot-date">${formatShortDate(slot.date)}</span>
                    <span class="booking-slot-time">${formatClockTime(slot.time)}</span>
                </div>
                ${btn}
            </li>
        `;
    }).join('');

    return `${headerHtml}<ul class="booking-slots">${slotsHtml}</ul>`;
};

const closeBound = new WeakSet();

const ensureBookingDialog = () => {
    const existing = document.querySelector('.booking-dialog');
    if (existing) return existing;
    const dialog = createDialog({
        className: 'booking-dialog',
        content: '<div class="booking-dialog-body"></div>',
    });
    return dialog;
};

const getContainer = (mode) => {
    if (mode === 'page') return document.querySelector('#view-invite .invite-inner');
    const dialog = ensureBookingDialog();
    if (!closeBound.has(dialog)) {
        closeBound.add(dialog);
        dialog.addEventListener('close', dismissViewOnlyToast);
    }
    return dialog.querySelector('.booking-dialog-body');
};

const setError = (container, message) => {
    if (!container) return;
    let err = container.querySelector('.dialog-error');
    if (!message) {
        if (err) err.remove();
        return;
    }
    if (!err) {
        err = document.createElement('p');
        err.className = 'dialog-error';
        container.appendChild(err);
    }
    err.textContent = message;
};

const boundHosts = new WeakSet();
const hostContext = new WeakMap();

const bindInteractions = (host, mode, state) => {
    hostContext.set(host, { mode, state });
    if (boundHosts.has(host)) return;
    boundHosts.add(host);

    host.addEventListener('click', async (e) => {
        const context = hostContext.get(host);
        if (!context) return;
        const { mode: activeMode, state: activeState } = context;
        const viewer = getUser();
        const bookBtn = e.target.closest('[data-action="book-slot"]');
        if (bookBtn) {
            const slotId = Number(bookBtn.dataset.slotId);
            if (!viewer) {
                setError(activeState.container, 'Sign in to book.');
                return;
            }
            if (viewer.role !== 'student') {
                setError(activeState.container, 'Only students can book slots.');
                return;
            }
            bookBtn.disabled = true;
            try {
                await apiFetch('/bookings', {
                    method: 'POST',
                    body: { student_id: viewer.id, slot_id: slotId },
                });
                setError(activeState.container, '');
                await refreshBookingView(activeMode, activeState);
                window.dispatchEvent(new CustomEvent('booking-changed'));
            } catch (err) {
                bookBtn.disabled = false;
                if (err instanceof ApiError && err.status === 409) {
                    setError(activeState.container, 'That slot was just booked by someone else.');
                    await refreshBookingView(activeMode, activeState);
                } else {
                    setError(activeState.container, err.message || 'Could not book.');
                }
            }
            return;
        }

        const cancelBtn = e.target.closest('[data-action="cancel-booking"]');
        if (cancelBtn) {
            const bookingId = Number(cancelBtn.dataset.bookingId);
            if (!confirm('Cancel this booking?')) return;
            cancelBtn.disabled = true;
            try {
                await apiFetch(`/bookings/${bookingId}`, {
                    method: 'DELETE',
                    body: { cancelled_by_role: 'student' },
                });
                await refreshBookingView(activeMode, activeState);
                window.dispatchEvent(new CustomEvent('booking-changed'));
            } catch (err) {
                cancelBtn.disabled = false;
                setError(activeState.container, err.message || 'Could not cancel.');
            }
            return;
        }
    });
};

const refreshBookingView = async (mode, state) => {
    try {
        const data = await apiFetch(`/invite/${encodeURIComponent(state.token)}`);
        const viewer = getUser();
        state.container.innerHTML = renderContent(data, viewer);
    } catch (err) {
        state.container.innerHTML = '';
        if (mode === 'page') {
            const holder = document.querySelector('#view-invite .invite-inner');
            if (holder) holder.innerHTML = `<div class="invite-error">${escapeHtml(err.message || 'Invite link not found.')}</div>`;
        } else {
            state.container.innerHTML = `<div class="booking-empty">${escapeHtml(err.message || 'Invite link not found.')}</div>`;
        }
    }
};

let activeViewOnlyToast = null;
let hashListenerBound = false;
const bindHashDismiss = () => {
    if (hashListenerBound) return;
    hashListenerBound = true;
    window.addEventListener('hashchange', () => {
        if (!/^#\/invite\//.test(location.hash)) dismissViewOnlyToast();
    });
};

const maybeShowViewOnlyToast = () => {
    const viewer = getUser();
    if (!viewer || viewer.role !== 'owner') return;
    if (activeViewOnlyToast) return;
    activeViewOnlyToast = showToast({
        content: `
            <span class="toast-title">You're signed in as a professor</span>
            <span class="toast-caption">Only students can book slots.</span>
        `,
        dismissable: true,
        timeout: 0,
    });
};

const dismissViewOnlyToast = () => {
    activeViewOnlyToast?.dismiss();
    activeViewOnlyToast = null;
};

export const openBookingDialog = async ({ ownerId, token, mode = 'modal' } = {}) => {
    const resolved = token || (ownerId ? await resolveToken(ownerId) : null);
    if (!resolved) return;

    const container = getContainer(mode);
    if (!container) return;

    const host = mode === 'page' ? container.parentElement : container;
    const state = { token: resolved, container };
    bindInteractions(host, mode, state);
    await refreshBookingView(mode, state);

    if (mode === 'modal') {
        const dialog = container.closest('dialog.booking-dialog');
        if (dialog) openDialog(dialog);
    }

    bindHashDismiss();
    maybeShowViewOnlyToast();
};
