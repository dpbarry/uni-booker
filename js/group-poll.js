import { apiFetch, getUser } from './global.js';
import { showToast } from './toast.js';
import { formatShortDate, formatClockTime } from './format.js';

export const openPollPage = async (token) => {
    const container = document.querySelector('.poll-inner');
    if (!container) return;

    container.innerHTML = '<p class="poll-loading">Loading...</p>';

    let data;
    try {
        const viewer = getUser();
        const qs = viewer ? `?viewer=${viewer.id}` : '';
        data = await apiFetch(`/group-polls/invite/${token}${qs}`);
    } catch (err) {
        container.innerHTML = `<p class="poll-error">${err.message || 'Failed to load poll'}</p>`;
        return;
    }

    const poll = data.poll;
    const slots = data.slots;
    const myVotes = data.myVotes;

    if (!poll) {
        container.innerHTML = `<div class="poll-closed"><h2>Group meeting</h2><p>This poll is no longer available.</p></div>`;
        return;
    }

    const selectedIds = [];
    for (const id of myVotes) {
        selectedIds.push(id);
    }

    let slotsHtml = '';
    for (const slot of slots) {
        const isSelected = selectedIds.includes(slot.id);
        slotsHtml += `
            <li class="poll-slot-row ${isSelected ? 'selected' : ''}" data-id="${slot.id}">
                <span class="poll-slot-date">${formatShortDate(slot.date)}</span>
                <span class="poll-slot-time">${formatClockTime(slot.time)}</span>
                <span class="poll-slot-check">✓</span>
            </li>
        `;
    }

    container.innerHTML = `
        <div class="poll-header">
            <h2 class="poll-title">${poll.title}</h2>
            <p class="poll-subtitle">Select all times that work for you</p>
        </div>
        <ul class="poll-slots-list">
            ${slotsHtml}
        </ul>
        <div class="poll-footer">
            <button type="button" class="primary-button press" id="poll-submit-btn">Save my availability</button>
        </div>
        <p class="poll-feedback" hidden></p>
    `;

    const rows = container.querySelectorAll('.poll-slot-row');
    for (const row of rows) {
        row.addEventListener('click', () => {
            const id = Number(row.dataset.id);
            const index = selectedIds.indexOf(id);
            if (index !== -1) {
                selectedIds.splice(index, 1);
                row.classList.remove('selected');
            } else {
                selectedIds.push(id);
                row.classList.add('selected');
            }
        });
    }

    const submitBtn = container.querySelector('#poll-submit-btn');
    submitBtn.addEventListener('click', async () => {
        const viewer = getUser();
        if (!viewer) return;
        submitBtn.disabled = true;
        try {
            await apiFetch(`/group-polls/invite/${token}/vote`, {
                method: 'POST',
                body: { viewer_id: viewer.id, slot_ids: selectedIds },
            });
            showToast({ content: '<span>Availability saved!</span>', timeout: 2500 });
        } catch (err) {
            showToast({ content: `<span>${err.message || 'Something went wrong'}</span>`, timeout: 2500, variant: 'error' });
        } finally {
            submitBtn.disabled = false;
        }
    });
};
