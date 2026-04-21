import { apiFetch, getUser, ApiError } from './global.js';
import { createDialog, openDialog, requestDialogClose } from './dialog.js';
import { showToast } from './toast.js';
import { escapeHtml, formatClockTime, formatShortDate, initialsFromEmail, toHm, toYmd } from './format.js';
import { createCalendar } from './calendar.js';
import { createTimePicker } from './time-picker.js';

const tokenCache = new Map();

const nextRequestDateTime = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(14, 0, 0, 0);
    return d;
};

const todayYmd = () => toYmd(new Date());
const isFutureDateTime = (ymd, hm) => {
    if (!ymd || !hm) return false;
    const [y, m, d] = ymd.split('-').map(Number);
    const [h, min] = hm.split(':').map(Number);
    const selected = new Date(y, m - 1, d, h, min, 0, 0);
    return selected.getTime() > Date.now();
};

const openRequestDialog = (ownerId) => {
    const start = nextRequestDateTime();

    const defaultDate = toYmd(start);
    const defaultTime = toHm(start);

    const dialog = createDialog({
        className: 'request-dialog',
        content: `
            <form class="dialog-form request-meeting-form" data-form="request-meeting">
                <header class="dialog-header">
                    <h2 class="dialog-title">Request a meeting</h2>
                    <button type="button" class="icon-button press" data-action="close-dialog" title="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24"><use href="assets/icons.svg#x" /></svg>
                    </button>
                </header>

                <div class="dialog-field dialog-field--date">
                    <div class="dialog-label-row">
                        <span class="dialog-label">Date</span>
                        <span class="dialog-field-warning" id="request-date-warning" aria-live="polite"></span>
                    </div>
                    <input type="hidden" name="date" value="${defaultDate}" required>
                    <div class="request-picker-calendar"></div>
                </div>

                <div class="dialog-field dialog-field--time">
                    <span class="dialog-label">Time</span>
                    <input type="hidden" name="time" value="${defaultTime}" required>
                    <div class="request-time-picker"></div>
                </div>

                <div class="dialog-field dialog-field--message">
                    <span class="dialog-label">Message (optional)</span>
                    <textarea name="message" class="request-message-input" rows="4" placeholder="Add a note…"></textarea>
                </div>

                <footer class="dialog-footer">
                    <div class="requesting-preview" aria-live="polite">
                        <span class="requesting-preview-label">Requesting</span>
                        <span class="requesting-preview-value" data-requesting-time></span>
                    </div>
                    <button type="submit" class="primary-button press request-send-btn">Send request</button>
                </footer>
            </form>
        `,
    });

    const form = dialog.querySelector('.dialog-form');
    const dateInput = form.querySelector('input[name="date"]');
    const timeInput = form.querySelector('input[name="time"]');
    const dateWarning = form.querySelector('#request-date-warning');
    const requestingTime = form.querySelector('[data-requesting-time]');
    const calendarHost = form.querySelector('.request-picker-calendar');
    const timePickerHost = form.querySelector('.request-time-picker');
    const submitBtn = form.querySelector('.request-send-btn');

    const syncSubmit = () => {
        const valid = isFutureDateTime(dateInput.value, timeInput.value);
        submitBtn.disabled = !valid;
        requestingTime.textContent = valid
            ? `${formatShortDate(dateInput.value)} at ${formatClockTime(timeInput.value)}`
            : '';
    };

    const setDateWarning = (msg) => {
        dateWarning.textContent = msg || '';
        dateWarning.style.opacity = msg ? '1' : '0';
    };

    const calendar = createCalendar(calendarHost, {
        mode: 'picker',
        view: 'month',
        onSelect: (date) => {
            dateInput.value = date;
            if (date < todayYmd()) {
                setDateWarning('Choose today or a future date.');
                syncSubmit();
                return;
            }
            setDateWarning('');
            syncSubmit();
        },
    });
    calendar.setSelected(defaultDate);
    calendar.goto(defaultDate);
    const timePicker = createTimePicker(timePickerHost, {
        value: defaultTime,
        onChange: (next) => {
            timeInput.value = next;
            syncSubmit();
        },
    });
    dialog.addEventListener('close', () => timePicker?.destroy(), { once: true });

    if (defaultDate >= todayYmd()) setDateWarning('');
    else setDateWarning('Choose today or a future date.');
    syncSubmit();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const viewer = getUser();
        if (viewer?.role !== 'student') return;

        const date = dateInput.value;
        const time = timeInput.value;
        const message = form.elements.message.value.trim();
        if (!isFutureDateTime(date, time)) return;

        submitBtn.disabled = true;

        try {
            await apiFetch('/requests', {
                method: 'POST',
                body: { student_id: viewer.id, owner_id: ownerId, date, time: `${time}:00`, message },
            });
            requestDialogClose(dialog);
            showToast({ content: '<span>Meeting request sent</span>', timeout: 2000 });
        } catch (err) {
            showToast({
                content: `<span>${escapeHtml(err.message || 'Could not send request.')}</span>`,
                variant: 'error',
                timeout: 4500,
            });
            submitBtn.disabled = false;
            syncSubmit();
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
                <span class="prof-avatar">${initialsFromEmail(owner.email)}</span>
                <div class="booking-heading-meta">
                    <span class="booking-heading-label">${isOwnerViewing ? 'Your slots' : 'Book with'}</span>
                    <a class="booking-heading-email" href="mailto:${encodeURIComponent(owner.email)}" title="Email ${escapeHtml(owner.email)}">
                        <span>${escapeHtml(owner.email)}</span>
                        <svg width="13" height="13" viewBox="0 0 24 24"><use href="assets/icons.svg#mail" /></svg>
                    </a>
                </div>
            </div>
            <button type="button" class="ghost-button press" data-action="share-booking-link" data-owner-id="${owner.id}">
                <svg width="14" height="14" viewBox="0 0 24 24"><use href="assets/icons.svg#link" /></svg>
                <span>Share link</span>
            </button>
        </div>
    `;

    const requestBtn = isStudent
        ? `<div class="booking-request-wrap"><button type="button" class="booking-request-btn press" data-action="request-meeting" data-owner-id="${owner.id}"><svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><use href="assets/icons.svg#calendar-days" /></svg><span>Request a meeting</span></button></div>`
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

const ensureBookingDialog = () => {
    const existing = document.querySelector('.booking-dialog');
    if (existing) return existing;
    const dialog = createDialog({
        className: 'booking-dialog',
        content: '<div class="booking-dialog-body"></div>',
    });
    dialog.addEventListener('close', dismissViewOnlyToast);
    return dialog;
};

const getContainer = (mode) => {
    if (mode === 'page') return document.querySelector('#view-invite .invite-inner');
    return ensureBookingDialog().querySelector('.booking-dialog-body');
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

        const shareBtn = e.target.closest('[data-action="share-booking-link"]');
        if (shareBtn) {
            const ownerId = Number(shareBtn.dataset.ownerId);
            try {
                const token = await resolveToken(ownerId);
                await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/invite/${token}`);
                showToast({ content: '<span>Invite link copied</span>', timeout: 2000 });
            } catch (err) {
                showToast({ content: `<span>${err.message || 'Failed to create link'}</span>`, timeout: 2000, variant: 'error' });
            }
        }

    });
};

const refreshBookingView = async (mode, state) => {
    try {
        const viewer = getUser();
        const qs = viewer ? `?viewer=${viewer.id}` : '';
        const data = await apiFetch(`/invite/${encodeURIComponent(state.token)}${qs}`);
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
