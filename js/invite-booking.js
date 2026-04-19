import { apiFetch, getUser, ApiError } from './global.js';
import { createDialog, openDialog, requestDialogClose } from './dialog.js';
import { showToast } from './toast.js';
import { escapeHtml, formatClockTime, formatShortDate, initialFromEmail } from './format.js';
import { createCalendar } from './calendar.js';

const tokenCache = new Map();

const pad2 = (n) => String(n).padStart(2, '0');
const toYmd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toHm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const nextRequestDateTime = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60 - (d.getMinutes() % 30));
    d.setSeconds(0, 0);

    return d;
};

const buildRequestTimeOptions = (selectEl) => {
    if (!selectEl || selectEl.options.length) return;

    const items = [];
    for (let h = 8; h <= 16; h++) {
        for (const m of [0, 30]) {
            const value = `${pad2(h)}:${pad2(m)}`;
            items.push(`<option value="${value}">${formatClockTime(value)}</option>`);
        }
    }

    selectEl.innerHTML = items.join('');
};

const openRequestDialog = (ownerId) => {
    const start = nextRequestDateTime();

    const defaultDate = toYmd(start);
    const defaultTime = toHm(start);

    const dialog = createDialog({
        className: 'request-dialog',
        content: `
            <form class="dialog-form" data-form="request-meeting">
                <header class="dialog-header">
                    <h2 class="dialog-title">Request a meeting</h2>
                    <button type="button" class="icon-button press" data-action="close-dialog" title="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24"><use href="assets/icons.svg#x" /></svg>
                    </button>
                </header>

                <label class="dialog-field">
                    <span>Date</span>
                    <input type="hidden" name="date" value="${defaultDate}" required>
                    <div class="request-picker-calendar"></div>
                </label>

                <label class="dialog-field">
                    <span>Time</span>
                    <select name="time" required></select>
                </label>

                <label class="dialog-field">
                    <span>Message (optional)</span>
                    <textarea name="message" rows="3" placeholder="Add a note..."></textarea>
                </label>

                <p class="dialog-error" hidden></p>

                <footer class="dialog-footer">
                    <button type="button" class="primary-button-ghost press" data-action="close-dialog">Cancel</button>
                    <button type="submit" class="primary-button press">Send request</button>
                </footer>
            </form>
        `,
    });

    const form = dialog.querySelector('.dialog-form');

    const errEl = form.querySelector('.dialog-error');
    const dateInput = form.querySelector('input[name="date"]');
    const timeSelect = form.querySelector('select[name="time"]');
    const calendarHost = form.querySelector('.request-picker-calendar');
    
    buildRequestTimeOptions(timeSelect);

    timeSelect.value = defaultTime;
    if (!timeSelect.value && timeSelect.options.length)
        timeSelect.selectedIndex = 0;

    const calendar = createCalendar(calendarHost, { mode: 'picker', view: 'month', onSelect: (date) => { dateInput.value = date; } });

    calendar.setSelected(defaultDate);
    calendar.goto(defaultDate);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const viewer = getUser();
        if (!viewer || viewer.role !== 'student')
            return;

        const date = dateInput.value;
        const time = timeSelect.value;
        const message = form.elements.message?.value?.trim() || '';
        if (!date || !time)
            return;

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn)
            submitBtn.disabled = true;

        if (errEl) { 
            errEl.hidden = true;
            errEl.textContent = '';
        }

        try {
            await apiFetch('/requests', {
                method: 'POST',
                body: { student_id: viewer.id, owner_id: ownerId, date, time: `${time}:00`, message },
            });

            requestDialogClose(dialog);

            showToast({ content: '<span>Meeting request sent</span>', timeout: 2000 });
        }
        catch (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Could not send request.';
                errEl.hidden = false;
            }
            
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    openDialog(dialog);
};

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

    const requestBtn = isStudent
        ? `<button type="button" class="primary-button-ghost press" data-action="request-meeting" data-owner-id="${owner.id}">Request a meeting</button>`
        : '';

    if (!slots.length) {
        return headerHtml + `<div class="booking-empty">No active slots available right now.</div>${requestBtn}`;
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

    return `${headerHtml}<ul class="booking-slots">${slotsHtml}</ul>${requestBtn}`;
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
const activeViewStates = new Map();

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

        const requestMeetingBtn = e.target.closest('[data-action="request-meeting"]');
        if (requestMeetingBtn) {
            const ownerId = Number(requestMeetingBtn.dataset.ownerId);
            openRequestDialog(ownerId);
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
    activeViewStates.set(mode, state);
    bindInteractions(host, mode, state);
    await refreshBookingView(mode, state);

    if (mode === 'modal') {
        const dialog = container.closest('dialog.booking-dialog');
        if (dialog) openDialog(dialog);
    }

    bindHashDismiss();
    maybeShowViewOnlyToast();
};

export const rehydrateBookingViews = async () => {
    const jobs = [];
    activeViewStates.forEach((state, mode) => {
        if (!state?.container || !document.body.contains(state.container)) {
            activeViewStates.delete(mode);
            return;
        }
        jobs.push(refreshBookingView(mode, state));
    });
    await Promise.all(jobs);
};
