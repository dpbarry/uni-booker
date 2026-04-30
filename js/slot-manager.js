// Dean Barry, Zheng Ye

import { apiFetch, getUser } from './global.js';
import { createDialog, openDialog, requestDialogClose, setDialogFooterError } from './dialog.js';
import { resolveToken } from './invite-booking.js';
import { refreshUpcoming } from './upcoming.js';
import { createCalendar } from './calendar.js';
import { createTimePicker } from './time-picker.js';
import { escapeHtml, formatClockTime, formatShortDate, isFutureDateTime, toHm, toYmd, todayYmd } from './format.js';

let slotPickerCalendar = null;
let slotTimePicker = null;

const nextSlotDateTime = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60 - (d.getMinutes() % 30));
    d.setSeconds(0, 0);
    return d;
};

const loadOwnerSlots = async (ownerId) => {
    try {
        return await apiFetch(`/slots/owner/${ownerId}`);
    } catch (err) {
        console.error('Error loading owner slots:', err);
        return [];
    }
};

const setSlotFieldWarning = (dialogEl, msg) => {
    const el = dialogEl?.querySelector('.slot-date-field-warning');
    if (!el) return;
    el.textContent = msg || '';
    el.style.opacity = msg ? '1' : '0';
};

const syncSlotFutureState = (dialogEl) => {
    if (!dialogEl) return;
    setDialogFooterError(dialogEl, null);
    const form = dialogEl.querySelector('.dialog-form');
    const submit = form?.querySelector('button[type="submit"]');
    const date = form?.elements.date?.value;
    const time = form?.elements.time?.value;
    if (!submit) return;
    if (!date || !time) {
        setSlotFieldWarning(dialogEl, null);
        submit.disabled = false;
        return;
    }
    if (date < todayYmd()) {
        setSlotFieldWarning(dialogEl, 'Choose today or a future date.');
        submit.disabled = true;
        return;
    }
    if (!isFutureDateTime(date, time)) {
        setSlotFieldWarning(dialogEl, 'Choose a future time.');
        submit.disabled = true;
        return;
    }
    setSlotFieldWarning(dialogEl, null);
    submit.disabled = false;
};

const updateSlotPreview = (dialogEl) => {
    if (!dialogEl) return;
    const date = dialogEl.querySelector('input[name="date"]')?.value;
    const time = dialogEl.querySelector('input[name="time"]')?.value;
    const valueEl = dialogEl.querySelector('[data-preview="slot"] .dialog-live-preview-value');
    if (!valueEl) return;
    if (!date || !time) {
        valueEl.textContent = '';
    } else {
        valueEl.textContent = `${formatShortDate(date)}, ${formatClockTime(time)}`;
    }
    syncSlotFutureState(dialogEl);
};

const ensureSlotDialogPicker = (dialogEl) => {
    if (!dialogEl) return;

    const dateInput = dialogEl.querySelector('input[name="date"]');
    const timeInput = dialogEl.querySelector('input[name="time"]');
    const timePickerHost = dialogEl.querySelector('.slot-time-picker');
    const calendarHost = dialogEl.querySelector('.slot-picker-calendar');
    if (!calendarHost || !dateInput || !timeInput || !timePickerHost) return;

    if (!slotPickerCalendar) {
        slotPickerCalendar = createCalendar(calendarHost, {
            mode: 'picker',
            view: 'month',
            onSelect: (date) => {
                dateInput.value = date;
                updateSlotPreview(dialogEl);
            },
        });
    }

    if (!slotTimePicker) {
        slotTimePicker = createTimePicker(timePickerHost, {
            value: timeInput.value || toHm(nextSlotDateTime()),
            onChange: (next) => {
                timeInput.value = next;
                updateSlotPreview(dialogEl);
            },
        });
    }
};

const resetSlotDialogForm = (dialogEl) => {
    if (!dialogEl) return;
    ensureSlotDialogPicker(dialogEl);
    const dateInput = dialogEl.querySelector('input[name="date"]');
    const timeInput = dialogEl.querySelector('input[name="time"]');
    const weeksInput = dialogEl.querySelector('input[name="repeat_weeks"]');
    const nameInput = dialogEl.querySelector('input[name="group_title"]');
    const start = nextSlotDateTime();
    const date = toYmd(start);
    dateInput.value = date;
    timeInput.value = toHm(start);
    if (weeksInput) weeksInput.value = '1';
    if (nameInput) nameInput.value = '';
    slotTimePicker?.setValue(timeInput.value, { silent: true });
    slotPickerCalendar?.setSelected(date);
    slotPickerCalendar?.goto(date);
    setDialogFooterError(dialogEl, null);
    setSlotFieldWarning(dialogEl, null);
    updateSlotPreview(dialogEl);
};

export const refreshOwnerSlots = async () => {
    const user = getUser();
    if (!user || user.role !== 'owner') return;
    const card = document.querySelector('.card-slots');
    if (!card) return;
    const list = card.querySelector('.slot-list');
    const empty = card.querySelector('[data-empty="owner-slots"]');

    const slots = await loadOwnerSlots(user.id);

    if (!slots.length) {
        list.hidden = true;
        list.innerHTML = '';
        empty.hidden = false;
        return;
    }

    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = slots.map((slot) => {
        const active = Boolean(slot.active);
        const bookingCount = Number(slot.booking_count) || 0;
        const rawTitle = String(slot.group_title || '').trim();
        const isGroupDefault = slot.type === 'group' && (!rawTitle || rawTitle.toLowerCase() === 'group meeting');
        const badgeLabel = !rawTitle && slot.type !== 'group'
            ? ''
            : isGroupDefault
                ? 'Group'
                : slot.type === 'group'
                    ? `Group - ${escapeHtml(rawTitle)}`
                    : escapeHtml(rawTitle);
        const bookedCell = slot.type === 'group' && bookingCount > 0
            ? `<button type="button" class="slot-attendees-btn press" data-action="view-slot-attendees" data-id="${slot.id}" data-count="${bookingCount}">View attendees (${bookingCount})</button>`
            : slot.booker_email
            ? `<a class="slot-booked-by" href="mailto:${encodeURIComponent(slot.booker_email)}" title="Email ${escapeHtml(slot.booker_email)}">
                    <svg width="12" height="12" viewBox="0 0 24 24"><use href="assets/icons.svg#mail" /></svg>
                    <span>${escapeHtml(slot.booker_email)}</span>
               </a>`
            : `<span class="slot-booked-empty"></span>`;
        return `
            <li class="slot-row" data-id="${slot.id}">
                <div class="slot-when">
                    <span class="slot-date">${formatShortDate(slot.date)}</span>
                    <span class="slot-time">${formatClockTime(slot.time)}</span>
                    ${badgeLabel ? `<span class="slot-group-label">${badgeLabel}</span>` : ''}
                </div>
                ${bookedCell}
                <button
                    type="button"
                    class="row-icon-button slot-toggle-button"
                    data-action="toggle-slot-input"
                    data-id="${slot.id}"
                    title="${active ? 'Deactivate slot' : 'Activate slot'}"
                >
                    ${active ? 'Deactivate' : 'Activate'}
                </button>
                <button type="button" class="row-icon-button" data-action="delete-slot" data-id="${slot.id}" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24"><use href="assets/icons.svg#x" /></svg>
                </button>
            </li>
        `;
    }).join('');
};

export const handleSlotManagerClick = async (e, { toast }) => {
    const newSlotBtn = e.target.closest('[data-action="new-slot"]');
    if (newSlotBtn) {
        const dlg = document.querySelector('.slot-dialog');
        resetSlotDialogForm(dlg);
        if (dlg) openDialog(dlg);
        return true;
    }

    const user = getUser();

    const shareBtn = e.target.closest('[data-action="share-link"]');
    if (shareBtn) {
        if (!user || user.role !== 'owner') return true;
        try {
            const token = await resolveToken(user.id);
            await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/invite/${token}`);
            toast('Invite link copied');
        } catch (err) {
            toast(err.message || 'Failed to create link', { error: true });
        }
        return true;
    }

    const toggleInput = e.target.closest('[data-action="toggle-slot-input"]');
    if (toggleInput) {
        const id = Number(toggleInput.dataset.id);
        try {
            await apiFetch(`/slots/${id}/toggle`, { method: 'PUT' });
            await Promise.all([refreshOwnerSlots(), refreshUpcoming()]);
        } catch (err) {
            toast(err.message || 'Failed to toggle', { error: true });
        }
        return true;
    }

    const attendeesBtn = e.target.closest('[data-action="view-slot-attendees"]');
    if (attendeesBtn) {
        const slotId = Number(attendeesBtn.dataset.id);
        if (!slotId) return true;
        attendeesBtn.disabled = true;
        try {
            const data = await apiFetch(`/slots/${slotId}/attendees`);
            const attendees = Array.isArray(data?.attendees) ? data.attendees : [];
            const count = attendees.length;
            const listHtml = count
                ? attendees
                      .map((a) => `<li class="slot-attendee-row">${escapeHtml(a.email)}</li>`)
                      .join('')
                : '<li class="slot-attendee-empty">No attendees yet.</li>';
            const dlg = createDialog({
                className: 'slot-attendees-dialog',
                content: `
                    <div class="dialog-form">
                        <header class="dialog-header">
                            <h2 class="dialog-title">Attendees (${count})</h2>
                            <button type="button" class="icon-button press" data-action="close-dialog" title="Close">
                                <svg width="18" height="18" viewBox="0 0 24 24"><use href="assets/icons.svg#x" /></svg>
                            </button>
                        </header>
                        <ul class="slot-attendees-list">${listHtml}</ul>
                    </div>
                `,
            });
            openDialog(dlg);
        } catch (err) {
            toast(err.message || 'Failed to load attendees', { error: true });
        } finally {
            attendeesBtn.disabled = false;
        }
        return true;
    }

    const deleteBtn = e.target.closest('[data-action="delete-slot"]');
    if (deleteBtn) {
        const id = Number(deleteBtn.dataset.id);
        if (!confirm('Delete this slot? If booked, the student will be notified.')) return true;
        try {
            await apiFetch(`/slots/${id}`, { method: 'DELETE' });
            await Promise.all([refreshOwnerSlots(), refreshUpcoming()]);
        } catch (err) {
            toast(err.message || 'Failed to delete', { error: true });
        }
        return true;
    }

    return false;
};

export const handleSlotManagerSubmit = async (e) => {
    const form = e.target.closest('.slot-dialog .dialog-form');
    if (!form) return false;
    e.preventDefault();
    const user = getUser();
    if (!user || user.role !== 'owner') return true;

    const dlg = form.closest('dialog');
    const date = form.elements.date?.value;
    const time = form.elements.time?.value;
    const repeatWeeks = Number(form.elements.repeat_weeks?.value || 1);
    const slotName = String(form.elements.group_title?.value || '').trim();
    if (!date || !time) return true;
    if (!isFutureDateTime(date, time)) {
        syncSlotFutureState(dlg);
        return true;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
        if (repeatWeeks > 1) {
            const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
            await apiFetch('/slots/recurring', {
                method: 'POST',
                body: {
                    owner_id: user.id,
                    days: [dayOfWeek],
                    time: `${time}:00`,
                    start_date: date,
                    weeks: repeatWeeks,
                    group_title: slotName || null,
                },
            });
        } 
        else {
            await apiFetch('/slots/create', {
                method: 'POST',
                body: {
                    owner_id: user.id,
                    date,
                    time: `${time}:00`,
                    group_title: slotName || null,
                },
            });
        }
        if (dlg) requestDialogClose(dlg);
        await refreshOwnerSlots();
    } catch (err) {
        setDialogFooterError(form, err.message || 'Failed to create');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
    return true;
};
