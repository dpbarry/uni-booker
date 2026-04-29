// Dean Barry

import { apiFetch, getUser } from './global.js';
import { openDialog, requestDialogClose, setDialogFooterError } from './dialog.js';
import { createCalendar } from './calendar.js';
import { createTimePicker } from './time-picker.js';
import { escapeHtml, formatShortDate, formatClockTime, isFutureDateTime, toHm, toYmd, todayYmd } from './format.js';
import { refreshOwnerSlots } from './slot-manager.js';
import { refreshUpcoming } from './upcoming.js';

let pendingFinalizeSlotId = null;
let pendingFinalizePollId = null;

let pollOptionStartTimePicker = null;
let pollOptionEndTimePicker = null;
let pollOptionDateCalendar = null;

const nextDateTime = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60 - (d.getMinutes() % 30));
    d.setSeconds(0, 0);
    return d;
};

const toDate = (ymd, hm) => {
    const [y, m, d] = String(ymd).split('-').map(Number);
    const [h, min] = String(hm).split(':').map(Number);
    return new Date(y, m - 1, d, h, min, 0, 0);
};

const setPollOptionFieldWarning = (dialogEl, msg) => {
    const el = dialogEl?.querySelector('.poll-option-date-field-warning');
    if (!el) return;
    el.textContent = msg || '';
    el.style.opacity = msg ? '1' : '0';
};

const syncPollOptionFieldWarning = (dialogEl) => {
    if (!dialogEl) return;
    setDialogFooterError(dialogEl, null);
    const submit = dialogEl.querySelector('button[type="submit"]');
    const date = dialogEl.querySelector('.poll-option-date')?.value;
    const start = dialogEl.querySelector('.poll-option-start-time')?.value;
    const end = dialogEl.querySelector('.poll-option-end-time')?.value;
    if (!submit) return;
    if (!date || !start || !end) {
        setPollOptionFieldWarning(dialogEl, null);
        submit.disabled = false;
        return;
    }
    if (date < todayYmd()) {
        setPollOptionFieldWarning(dialogEl, 'Choose today or a future date.');
        submit.disabled = true;
        return;
    }
    if (!isFutureDateTime(date, start)) {
        setPollOptionFieldWarning(dialogEl, 'Choose a future time.');
        submit.disabled = true;
        return;
    }
    if (toDate(date, start) >= toDate(date, end)) {
        setPollOptionFieldWarning(dialogEl, 'End time must be after start time.');
        submit.disabled = true;
        return;
    }
    const list = document.querySelector('.poll-dialog .poll-added-slots');
    const key = `${date}|${start}|${end}`;
    const exists = list && [...list.querySelectorAll('.poll-added-slot-row')]
        .some((row) => row.dataset.dayRangeKey === key);
    if (exists) {
        setPollOptionFieldWarning(dialogEl, 'That date/time range is already added.');
        submit.disabled = true;
        return;
    }
    setPollOptionFieldWarning(dialogEl, null);
    submit.disabled = false;
};

const updatePollOptionPreview = (dialogEl) => {
    if (!dialogEl) return;
    const date = dialogEl.querySelector('.poll-option-date')?.value;
    const startTime = dialogEl.querySelector('.poll-option-start-time')?.value;
    const valueEl = dialogEl.querySelector('[data-preview="poll-option"] .dialog-live-preview-value');
    if (!valueEl) return;
    if (!date || !startTime) {
        valueEl.textContent = '';
    } else {
        valueEl.textContent = `${formatShortDate(date)}, ${formatClockTime(startTime)}`;
    }
    syncPollOptionFieldWarning(dialogEl);
};

document.addEventListener('input', (e) => {
    if (!e.target.classList?.contains('poll-title-input')) return;
    const dlg = e.target.closest('.poll-dialog');
    if (!dlg) return;
    setDialogFooterError(dlg, null);
});

const ensureOptionDialogPickers = (dialogEl) => {
    if (!dialogEl) return;
    const dateInput = dialogEl.querySelector('.poll-option-date');
    const calendarHost = dialogEl.querySelector('.poll-option-date-calendar');
    const startInput = dialogEl.querySelector('.poll-option-start-time');
    const endInput = dialogEl.querySelector('.poll-option-end-time');
    const startHost = dialogEl.querySelector('.poll-option-start-timepicker');
    const endHost = dialogEl.querySelector('.poll-option-end-timepicker');
    const start = nextDateTime();
    const end = new Date(start);
    end.setHours(start.getHours() + 2, start.getMinutes(), 0, 0);
    if (!dateInput.value) dateInput.value = toYmd(start);
    if (!startInput.value) startInput.value = toHm(start);
    if (!endInput.value) endInput.value = toHm(end);

    if (!pollOptionDateCalendar) {
        pollOptionDateCalendar = createCalendar(calendarHost, {
            mode: 'picker',
            view: 'month',
            onSelect: (date) => {
                dateInput.value = date;
                updatePollOptionPreview(dialogEl);
            },
        });
    }
    pollOptionDateCalendar.setSelected(dateInput.value);
    pollOptionDateCalendar.goto(dateInput.value);

    if (!pollOptionStartTimePicker) {
        pollOptionStartTimePicker = createTimePicker(startHost, {
            value: startInput.value,
            onChange: (val) => {
                startInput.value = val;
                updatePollOptionPreview(dialogEl);
            },
        });
    }
    if (!pollOptionEndTimePicker) {
        pollOptionEndTimePicker = createTimePicker(endHost, {
            value: endInput.value,
            onChange: (val) => {
                endInput.value = val;
                updatePollOptionPreview(dialogEl);
            },
        });
    }
    updatePollOptionPreview(dialogEl);
};

const resetDialog = (dialogEl) => {
    if (!dialogEl) return;
    dialogEl.querySelector('.poll-title-input').value = '';
    dialogEl.querySelector('.poll-added-slots').innerHTML = '';
    setDialogFooterError(dialogEl, null);
    const optionDialog = document.querySelector('.poll-option-dialog');
    if (optionDialog) {
        pollOptionDateCalendar = null;
        pollOptionStartTimePicker = null;
        pollOptionEndTimePicker = null;
        optionDialog.querySelector('.poll-option-date-calendar').innerHTML = '';
        optionDialog.querySelector('.poll-option-start-timepicker').innerHTML = '';
        optionDialog.querySelector('.poll-option-end-timepicker').innerHTML = '';
        optionDialog.querySelector('.poll-option-date').value = '';
        optionDialog.querySelector('.poll-option-start-time').value = '';
        optionDialog.querySelector('.poll-option-end-time').value = '';
        setDialogFooterError(optionDialog, null);
        setPollOptionFieldWarning(optionDialog, null);
        updatePollOptionPreview(optionDialog);
    }
};

export const refreshOwnerPolls = async () => {
    const user = getUser();
    if (!user || user.role !== 'owner') return;
    const card = document.querySelector('.card-polls');
    if (!card) return;
    const list = card.querySelector('.poll-list');
    const empty = card.querySelector('[data-empty="owner-polls"]');

    let polls = [];
    try {
        polls = await apiFetch(`/group-polls/owner/${user.id}`);
    } catch (err) {
        console.error('failed to load polls', err);
        return;
    }
    if (polls.length === 0) {
        list.hidden = true;
        list.innerHTML = '';
        empty.hidden = false;
        return;
    }

    empty.hidden = true;
    list.hidden = false;

    list.innerHTML = '';
    for (let i = 0; i < polls.length; i++) {
        const poll = polls[i];

        const li = document.createElement('li');
        li.className = 'owner-poll-card';
        li.dataset.id = poll.id;

        const totalVotes = poll.slots.reduce((sum, s) => sum + (Number(s.vote_count) || 0), 0);
        const voteSummary = totalVotes === 1 ? '1 vote' : `${totalVotes} votes`;
        const nOpt = poll.slots.length;
        const optSummary = nOpt === 1 ? '1 time option' : `${nOpt} time options`;

        let slotsHtml = '';
        for (let j = 0; j < poll.slots.length; j++) {
            const slot = poll.slots[j];
            const voteLabel = slot.vote_count === 1 ? '1 vote' : `${slot.vote_count} votes`;
            const selectBtn = `<button type="button" class="ghost-button press" data-action="finalize-poll" data-poll-id="${poll.id}" data-slot-id="${slot.id}">Select</button>`;
            slotsHtml += `
                <li class="owner-poll-slot-row">
                    <div class="owner-poll-slot-when">
                        <span class="owner-poll-slot-date">${formatShortDate(slot.date)}</span>
                        <span class="owner-poll-slot-time">${formatClockTime(slot.time)}</span>
                    </div>
                    <span class="owner-poll-slot-votes">${voteLabel}</span>
                    ${selectBtn}
                </li>
            `;
        }

        li.innerHTML = `
        <div class="owner-poll-card-head">
            <div class="owner-poll-card-lead">
                <span class="owner-poll-card-title">${escapeHtml(poll.title)}</span>
                <span class="owner-poll-card-meta">${voteSummary} · ${optSummary}</span>
            </div>
            <div class="owner-poll-card-tools">
                <button type="button" class="row-icon-button" data-action="delete-poll" data-poll-id="${poll.id}" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24"><use href="assets/icons.svg#x" /></svg>
                </button>
            </div>
        </div>
        <ul class="owner-poll-slot-list">${slotsHtml}</ul>
        `;

        list.appendChild(li);
    }
};

export const handlePollManagerClick = async (e, { toast }) => {
    const newPollBtn = e.target.closest('[data-action="new-poll"]');
    if (newPollBtn) {
        const dlg = document.querySelector('.poll-dialog');
        resetDialog(dlg);
        openDialog(dlg);
        return true;
    }

    const openOptionBtn = e.target.closest('[data-action="open-poll-option-dialog"]');
    if (openOptionBtn) {
        const optionDialog = document.querySelector('.poll-option-dialog');
        setDialogFooterError(optionDialog, null);
        setPollOptionFieldWarning(optionDialog, null);
        ensureOptionDialogPickers(optionDialog);
        if (optionDialog) openDialog(optionDialog);
        return true;
    }

    const removeSlotBtn = e.target.closest('[data-action="remove-poll-slot"]');
    if (removeSlotBtn) {
        removeSlotBtn.closest('.poll-added-slot-row').remove();
        const dlg = document.querySelector('.poll-dialog');
        if (dlg) {
            setDialogFooterError(dlg, null);
        }
        return true;
    }

    const submitBtn = e.target.closest('[data-action="submit-poll"]');
    if (submitBtn) {
        const user = getUser();
        const dlg = document.querySelector('.poll-dialog');
        const title = dlg.querySelector('.poll-title-input').value.trim();

        const slotRows = dlg.querySelectorAll('.poll-added-slot-row');
        const slots = [];
        for (let i = 0; i < slotRows.length; i++) {
            const row = slotRows[i];
            slots.push({ date: row.dataset.date, time: row.dataset.time });
        }

        if (slots.length === 0) {
            setDialogFooterError(dlg, 'Please add at least one time slot');
            return true;
        }

        submitBtn.disabled = true;
        try {
            await apiFetch('/group-polls', {
                method: 'POST',
                body: { owner_id: user.id, title, slots },
            });
            requestDialogClose(dlg);
            await refreshOwnerPolls();
            toast('Group meeting created!');
        } catch (err) {
            setDialogFooterError(dlg, err.message || 'Something went wrong');
        } finally {
            submitBtn.disabled = false;
        }
        return true;
    }

    const finalizeBtn = e.target.closest('[data-action="finalize-poll"]');
    if (finalizeBtn) {
        pendingFinalizePollId = finalizeBtn.dataset.pollId;
        pendingFinalizeSlotId = finalizeBtn.dataset.slotId;

        const dlg = document.querySelector('.finalize-dialog');
        const slotRow = finalizeBtn.closest('.owner-poll-slot-row');
        const dateText = slotRow?.querySelector('.owner-poll-slot-date')?.textContent || '';
        const timeText = slotRow?.querySelector('.owner-poll-slot-time')?.textContent || '';
        const timeLabel = dateText && timeText ? `${dateText} at ${timeText}` : '';
        dlg.querySelector('.finalize-selected-time').textContent = timeLabel;
        dlg.querySelector('.dialog-error').hidden = true;
        dlg.querySelector('.dialog-error').textContent = '';
        const weeksInput = dlg.querySelector('.finalize-weeks-input');
        if (weeksInput) weeksInput.value = '1';

        openDialog(dlg);
        return true;
    }

    const confirmBtn = e.target.closest('[data-action="confirm-finalize"]');
    if (confirmBtn) {
        const dlg = document.querySelector('.finalize-dialog');
        const weeksRaw = Number(dlg.querySelector('.finalize-weeks-input')?.value || 1);
        const weeks = Number.isFinite(weeksRaw) ? weeksRaw : 1;

        confirmBtn.disabled = true;
        try {
            await apiFetch(`/group-polls/${pendingFinalizePollId}/finalize`, {
                method: 'POST',
                body: { slot_id: Number(pendingFinalizeSlotId), weeks },
            });
            requestDialogClose(dlg);
            await Promise.all([refreshOwnerPolls(), refreshOwnerSlots(), refreshUpcoming()]);
            toast('Meeting slot created');
        } catch (err) {
            dlg.querySelector('.dialog-error').textContent = err.message || 'Something went wrong';
            dlg.querySelector('.dialog-error').hidden = false;
        } finally {
            confirmBtn.disabled = false;
        }
        return true;
    }

    const deleteBtn = e.target.closest('[data-action="delete-poll"]');
    if (deleteBtn) {
        if (!confirm('Delete this group meeting?')) return true;
        const pollId = deleteBtn.dataset.pollId;
        try {
            await apiFetch(`/group-polls/${pollId}`, { method: 'DELETE' });
            await refreshOwnerPolls();
            toast('Group meeting deleted.');
        } catch (err) {
            toast(err.message || 'Something went wrong', { error: true });
        }
        return true;
    }


    return false;
};

let optionFormBound = false;
const bindOptionDialogSubmit = () => {
    if (optionFormBound) return;
    optionFormBound = true;
    document.addEventListener('submit', (e) => {
        const form = e.target.closest('.poll-option-dialog .dialog-form[data-form="poll-option"]');
        if (!form) return;
        e.preventDefault();

        const optionDialog = form.closest('.poll-option-dialog');
        const parentDialog = document.querySelector('.poll-dialog');
        const list = parentDialog?.querySelector('.poll-added-slots');
        if (!list) return;

        syncPollOptionFieldWarning(optionDialog);
        if (form.querySelector('button[type="submit"]')?.disabled) return;

        const date = form.querySelector('.poll-option-date').value;
        const startTime = form.querySelector('.poll-option-start-time').value;
        const endTime = form.querySelector('.poll-option-end-time').value;
        if (!date || !startTime || !endTime) return;

        const existingKey = `${date}|${startTime}|${endTime}`;

        const li = document.createElement('li');
        li.className = 'poll-added-slot-row';
        li.dataset.date = date;
        li.dataset.time = `${startTime}:00`;
        li.dataset.dayRangeKey = existingKey;
        li.innerHTML = `
            <div class="poll-added-slot-main">
                <span class="poll-added-slot-date">${formatShortDate(date)}</span>
                <span class="poll-added-slot-time">${formatClockTime(startTime)} - ${formatClockTime(endTime)}</span>
            </div>
            <button type="button" class="row-icon-button" data-action="remove-poll-slot">
                <svg width="14" height="14" viewBox="0 0 24 24"><use href="assets/icons.svg#x" /></svg>
            </button>
        `;
        list.appendChild(li);
        if (parentDialog) {
            setDialogFooterError(parentDialog, null);
        }
        requestDialogClose(optionDialog);
    });
};

bindOptionDialogSubmit();
