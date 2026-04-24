import { apiFetch, getUser } from './global.js';
import { openDialog, requestDialogClose } from './dialog.js';
import { resolveToken } from './invite-booking.js';
import { refreshUpcoming } from './upcoming.js';
import { createCalendar } from './calendar.js';
import { createTimePicker } from './time-picker.js';
import { escapeHtml, formatClockTime, formatShortDate, toHm, toYmd } from './format.js';

let slotPickerCalendar = null;
let slotTimePicker = null;

let recurringPickerCalendar = null;
let recurringTimePicker = null;

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

const ensureSlotDialogPicker = (dialogEl) => {
    if (!dialogEl) return;
    
    const calendarHost = dialogEl.querySelector('.slot-picker-calendar');
    const dateInput = dialogEl.querySelector('input[name="date"]');
    const timeInput = dialogEl.querySelector('input[name="time"]');
    const timePickerHost = dialogEl.querySelector('.slot-time-picker');
    if (!calendarHost || !dateInput || !timeInput || !timePickerHost) return;

    if (!slotPickerCalendar) {
        slotPickerCalendar = createCalendar(calendarHost, {
            mode: 'picker',
            view: 'month',
            onSelect: (date) => {
                dateInput.value = date;
            },
        });
    }

    if (!slotTimePicker) {
        slotTimePicker = createTimePicker(timePickerHost, {
            value: timeInput.value || toHm(nextSlotDateTime()),
            onChange: (next) => { timeInput.value = next; },
        });
    }
};

const resetSlotDialogForm = (dialogEl) => {
    if (!dialogEl) return;
    ensureSlotDialogPicker(dialogEl);
    const dateInput = dialogEl.querySelector('input[name="date"]');
    const timeInput = dialogEl.querySelector('input[name="time"]');
    const err = dialogEl.querySelector('.dialog-error');
    const start = nextSlotDateTime();
    const date = toYmd(start);
    dateInput.value = date;
    timeInput.value = toHm(start);
    slotTimePicker?.setValue(timeInput.value, { silent: true });
    slotPickerCalendar?.setSelected(date);
    slotPickerCalendar?.goto(date);
    err.hidden = true;
    err.textContent = '';
};

const ensureRecurringDialogPicker = (dialogEl) => {
    if (!dialogEl) return;

    const timeInput = dialogEl.querySelector('input[name="time"]');
    const dateInput = dialogEl.querySelector('input[name="start_date"]');
    const timePickerHost = dialogEl.querySelector('.recurring-time-picker');
    const calendarHost = dialogEl.querySelector('.recurring-picker-calendar');    
    if (!calendarHost || !dateInput || !timeInput || !timePickerHost)return;

    if (!recurringPickerCalendar) {
        recurringPickerCalendar = createCalendar(calendarHost, {
            mode: 'picker',
            view: 'month',
            onSelect: (date) => { dateInput.value = date; },
        });
    }

    if (!recurringTimePicker) {
        recurringTimePicker = createTimePicker(timePickerHost, {
            value: timeInput.value || toHm(nextSlotDateTime()),
            onChange: (next) => { timeInput.value = next; },
        });
    }
};

const resetRecurringDialogForm = (dialogEl) => {
    if (!dialogEl) return;

    ensureRecurringDialogPicker(dialogEl);
    const timeInput = dialogEl.querySelector('input[name="time"]');
    const weeksInput = dialogEl.querySelector('input[name="weeks"]');
    const dateInput = dialogEl.querySelector('input[name="start_date"]');
    const err = dialogEl.querySelector('.dialog-error');

    const start = nextSlotDateTime();
    const date = toYmd(start);

    dateInput.value = date;
    timeInput.value = toHm(start);
    if (weeksInput)
        weeksInput.value = '15'; // Reset weeks number to 15; a typical semester length at McGill

    dialogEl.querySelectorAll('input[name="days"]').forEach((cb) => { cb.checked = false; });
    recurringTimePicker?.setValue(timeInput.value, { silent: true });
    recurringPickerCalendar?.setSelected(date);
    recurringPickerCalendar?.goto(date);

    err.hidden = true;
    err.textContent = '';
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
        const bookedCell = slot.booker_email
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

    const newRecurringBtn = e.target.closest('[data-action="new-recurring-slot"]');
    if (newRecurringBtn) {
        const dlg = document.querySelector('.recurring-slot-dialog');
        resetRecurringDialogForm(dlg);
        if (dlg)
            openDialog(dlg);

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
    const recurringForm = e.target.closest('.recurring-slot-dialog .dialog-form');
    if (recurringForm) {
        e.preventDefault();

        const user = getUser();
        if (!user || user.role !== 'owner')
            return true;

        const time = recurringForm.elements.time?.value;
        const weeks = Number(recurringForm.elements.weeks?.value);
        const start_date = recurringForm.elements.start_date?.value;

        const dlg = recurringForm.closest('dialog');
        const errEl = recurringForm.querySelector('.dialog-error');
        const days = [...recurringForm.querySelectorAll('input[name="days"]:checked')].map((cb) => Number(cb.value));
        if (!days.length) {
            errEl.textContent = 'Select at least one day.';
            errEl.hidden = false;

            return true;
        }

        if (!time || !start_date || !weeks)
            return true;

        const submitBtn = recurringForm.querySelector('button[type="submit"]');
        if (submitBtn)
            submitBtn.disabled = true;

        try {
            const result = await apiFetch('/slots/recurring', {
                method: 'POST',
                body: { owner_id: user.id, days, time: `${time}:00`, start_date, weeks },
            });
            if (dlg)
                requestDialogClose(dlg);

            await refreshOwnerSlots();
        }
        catch (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Failed to create recurring slots';
                errEl.hidden = false;
            }
        } 
        finally {
            if (submitBtn) submitBtn.disabled = false;
        }

        return true;
    }

    const form = e.target.closest('.slot-dialog .dialog-form');
    if (!form) return false;
    e.preventDefault();
    const user = getUser();
    if (!user || user.role !== 'owner') return true;

    const dlg = form.closest('dialog');
    const errEl = form.querySelector('.dialog-error');
    const date = form.elements.date?.value;
    const time = form.elements.time?.value;
    if (!date || !time) return true;

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
        await apiFetch('/slots/create', {
            method: 'POST',
            body: { owner_id: user.id, date, time: `${time}:00` },
        });
        if (dlg) requestDialogClose(dlg);
        await refreshOwnerSlots();
    } catch (err) {
        if (errEl) {
            errEl.textContent = err.message || 'Failed to create';
            errEl.hidden = false;
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
    return true;
};
