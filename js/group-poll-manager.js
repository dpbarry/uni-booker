import { apiFetch, getUser } from './global.js';
import { openDialog, requestDialogClose } from './dialog.js';
import { createCalendar } from './calendar.js';
import { createTimePicker } from './time-picker.js';
import { formatShortDate, formatClockTime, toHm, toYmd } from './format.js';
import { showToast } from './toast.js';

let pendingFinalizeSlotId = null;
let pendingFinalizePollId = null;

let pollCalendar = null;
let pollTimePicker = null;

const nextDateTime = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60 - (d.getMinutes() % 30));
    d.setSeconds(0, 0);
    return d;
};

const ensurePickerInit = (dialogEl) => {
    if (!dialogEl) return;
    const calendarHost = dialogEl.querySelector('.poll-new-calendar');
    const dateInput = dialogEl.querySelector('.poll-new-date');
    const timeInput = dialogEl.querySelector('.poll-new-time');
    const timePickerHost = dialogEl.querySelector('.poll-new-timepicker');

    const start = nextDateTime();
    if (!dateInput.value) dateInput.value = toYmd(start);
    if (!timeInput.value) timeInput.value = toHm(start);

    if (!pollCalendar) {
        pollCalendar = createCalendar(calendarHost, {
            mode: 'picker',
            view: 'month',
            onSelect: (date) => { dateInput.value = date; },
        });
    }

    if (!pollTimePicker) {
        pollTimePicker = createTimePicker(timePickerHost, {
            value: timeInput.value,
            onChange: (val) => { timeInput.value = val; },
        });
    }
};

const resetDialog = (dialogEl) => {
    if (!dialogEl) return;
    dialogEl.querySelector('.poll-title-input').value = '';
    dialogEl.querySelector('.poll-added-slots').innerHTML = '';
    dialogEl.querySelector('.poll-invitees-list').innerHTML = '';
    dialogEl.querySelector('.poll-invitee-input').value = '';
    dialogEl.querySelector('.dialog-error').hidden = true;
    dialogEl.querySelector('.dialog-error').textContent = '';
    pollCalendar = null;
    pollTimePicker = null;
    dialogEl.querySelector('.poll-new-calendar').innerHTML = '';
    dialogEl.querySelector('.poll-new-timepicker').innerHTML = '';
    dialogEl.querySelector('.poll-new-date').value = '';
    dialogEl.querySelector('.poll-new-time').value = '';
    ensurePickerInit(dialogEl);
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
        li.className = 'poll-row';
        li.dataset.id = poll.id;

        let slotsHtml = '';
        for (let j = 0; j < poll.slots.length; j++) {
            const slot = poll.slots[j];
            const voteLabel = slot.vote_count === 1 ? '1 vote' : slot.vote_count + ' votes';
            let selectBtn = '';
            if (poll.status === 'open') {
                selectBtn = `<button type="button" class="ghost-button press" data-action="finalize-poll" data-poll-id="${poll.id}" data-slot-id="${slot.id}">Select</button>`;
            }
            slotsHtml += `
                <li class="poll-result-row">
                    <span class="poll-result-date">${formatShortDate(slot.date)}</span>
                    <span class="poll-result-time">${formatClockTime(slot.time)}</span>
                    <span class="poll-result-count">${voteLabel}</span>
                    ${selectBtn}
                </li>
            `;
        }

        const statusLabel = poll.status === 'closed' ? 'closed' : 'open';
        li.innerHTML = `
        <div class="poll-row-header">
            <span class="poll-row-title">${poll.title}</span>
            <div class="poll-row-actions">
                <span class="poll-row-status status-${statusLabel}">${statusLabel}</span>
                <button type="button" class="row-icon-button" data-action="delete-poll" data-poll-id="${poll.id}" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24"><use href="assets/icons.svg#x" /></svg>
                </button>
            </div>
        </div>
        <ul class="poll-results-list">${slotsHtml}</ul>
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

    const addSlotBtn = e.target.closest('[data-action="add-poll-slot"]');
    if (addSlotBtn) {
        const dlg = document.querySelector('.poll-dialog');
        const dateInput = dlg.querySelector('.poll-new-date');
        const timeInput = dlg.querySelector('.poll-new-time');
        if (!dateInput.value || !timeInput.value) return true;

        const list = dlg.querySelector('.poll-added-slots');
        const li = document.createElement('li');
        li.className = 'poll-added-slot-row';
        li.dataset.date = dateInput.value;
        li.dataset.time = timeInput.value;
        li.innerHTML = `
            <span>${formatShortDate(dateInput.value)} at ${formatClockTime(timeInput.value)}</span>
            <button type="button" class="row-icon-button" data-action="remove-poll-slot">
                <svg width="14" height="14" viewBox="0 0 24 24"><use href="assets/icons.svg#x" /></svg>
            </button>
        `;
        list.appendChild(li);
        return true;
    }

    const removeSlotBtn = e.target.closest('[data-action="remove-poll-slot"]');
    if (removeSlotBtn) {
        removeSlotBtn.closest('.poll-added-slot-row').remove();
        return true;
    }

    const addInviteeBtn = e.target.closest('[data-action="add-invitee"]');
    if (addInviteeBtn) {
        const dlg = document.querySelector('.poll-dialog');
        const input = dlg.querySelector('.poll-invitee-input');
        const email = input.value.trim();
        if (!email) return true;

        const list = dlg.querySelector('.poll-invitees-list');
        const li = document.createElement('li');
        li.className = 'poll-invitee-row';
        li.dataset.email = email;
        li.innerHTML = `
            <span>${email}</span>
            <button type="button" class="row-icon-button" data-action="remove-invitee">
                <svg width="14" height="14" viewBox="0 0 24 24"><use href="assets/icons.svg#x" /></svg>
            </button>
        `;
        list.appendChild(li);
        input.value = '';
        return true;
    }

    const removeInviteeBtn = e.target.closest('[data-action="remove-invitee"]');
    if (removeInviteeBtn) {
        removeInviteeBtn.closest('.poll-invitee-row').remove();
        return true;
    }

    const submitBtn = e.target.closest('[data-action="submit-poll"]');
    if (submitBtn) {
        const user = getUser();
        const dlg = document.querySelector('.poll-dialog');
        const errEl = dlg.querySelector('.dialog-error');
        const title = dlg.querySelector('.poll-title-input').value.trim();

        const slotRows = dlg.querySelectorAll('.poll-added-slot-row');
        const slots = [];
        for (let i = 0; i < slotRows.length; i++) {
            slots.push({ date: slotRows[i].dataset.date, time: slotRows[i].dataset.time + ':00' });
        }

        const inviteeRows = dlg.querySelectorAll('.poll-invitee-row');
        const invitees = [];
        for (let i = 0; i < inviteeRows.length; i++) {
            invitees.push(inviteeRows[i].dataset.email);
        }

        if (!title) {
            errEl.textContent = 'Please add a title';
            errEl.hidden = false;
            return true;
        }
        if (slots.length === 0) {
            errEl.textContent = 'Please add at least one time slot';
            errEl.hidden = false;
            return true;
        }
        if (invitees.length === 0) {
            errEl.textContent = 'Please add at least one invitee';
            errEl.hidden = false;
            return true;
        }

        submitBtn.disabled = true;
        try {
            await apiFetch('/group-polls', {
                method: 'POST',
                body: { owner_id: user.id, title, slots, invitees },
            });
            requestDialogClose(dlg);
            await refreshOwnerPolls();
            toast('Group meeting created!');
        } catch (err) {
            errEl.textContent = err.message || 'Something went wrong';
            errEl.hidden = false;
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
        const timeLabel = finalizeBtn.closest('.poll-result-row').querySelector('.poll-result-date').textContent
            + ' at ' + finalizeBtn.closest('.poll-result-row').querySelector('.poll-result-time').textContent;
        dlg.querySelector('.finalize-selected-time').textContent = timeLabel;
        dlg.querySelector('.dialog-error').hidden = true;

        const radios = dlg.querySelectorAll('input[name="repeat-type"]');
        for (const radio of radios) {
            radio.checked = radio.value === 'once';
        }
        dlg.querySelector('.finalize-weeks-field').hidden = true;

        radios.forEach(radio => {
            radio.onchange = () => {
                dlg.querySelector('.finalize-weeks-field').hidden = radio.value !== 'repeat';
            };
        });

        openDialog(dlg);
        return true;
    }

    const confirmBtn = e.target.closest('[data-action="confirm-finalize"]');
    if (confirmBtn) {
        const dlg = document.querySelector('.finalize-dialog');
        const repeatType = dlg.querySelector('input[name="repeat-type"]:checked').value;
        const weeks = repeatType === 'repeat' ? Number(dlg.querySelector('.finalize-weeks-input').value) : 1;

        confirmBtn.disabled = true;
        try {
            await apiFetch(`/group-polls/${pendingFinalizePollId}/finalize`, {
                method: 'POST',
                body: { slot_id: Number(pendingFinalizeSlotId), weeks },
            });
            requestDialogClose(dlg);
            await refreshOwnerPolls();
            toast('Meeting confirmed! Invitees have been notified.');
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
