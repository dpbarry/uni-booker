// Dean Barry, Mariana Diaz Betancourt

import { apiFetch, getUser } from './global.js';
import { showToast } from './toast.js';
import { formatShortDate, formatClockTime } from './format.js';

let activeOwnerViewOnlyToast = null;
let hashDismissBound = false;

const dismissOwnerViewOnlyToast = () => {
    activeOwnerViewOnlyToast?.dismiss();
    activeOwnerViewOnlyToast = null;
};

const bindHashDismiss = () => {
    if (hashDismissBound) return;
    hashDismissBound = true;
    window.addEventListener('hashchange', () => {
        if (!/^#\/poll\//.test(location.hash)) dismissOwnerViewOnlyToast();
    });
};

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
    const slots = Array.isArray(data.slots) ? data.slots : [];
    const myVotes = Array.isArray(data.myVotes) ? data.myVotes : [];
    const viewer = getUser();
    const isStudent = viewer?.role === 'student';

    if (!poll) {
        dismissOwnerViewOnlyToast();
        container.innerHTML = `<div class="poll-closed"><h2>Group meeting</h2><p>This poll is no longer available.</p></div>`;
        return;
    }

    const selectedIds = new Set(myVotes.map(Number));
    const pollTitle = String(poll.title || '').trim() || 'Group meeting';
    const voteCounts = new Map(
        slots.map((s) => [Number(s.id), Math.max(0, Number(s.vote_count) || 0)]),
    );

    const voteLabelFor = (n) => (n === 1 ? '1 vote' : `${n} votes`);

    const slotsHtml = slots
        .map((slot) => {
            const isSelected = selectedIds.has(Number(slot.id));
            const voteCount = voteCounts.get(Number(slot.id)) ?? 0;
            const voteLabel = voteLabelFor(voteCount);
            return `
                <button type="button" class="poll-vote-option poll-page-option${isSelected ? ' is-selected' : ''}" data-action="toggle-poll-vote" data-slot-id="${slot.id}" aria-pressed="${isSelected ? 'true' : 'false'}"${isStudent ? '' : ' disabled'}>
                    <span class="poll-vote-pick" aria-hidden="true">
                        <svg class="poll-vote-check" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><use href="assets/icons.svg#check" /></svg>
                    </span>
                    <span class="poll-vote-when">
                        <span class="booking-slot-date">${formatShortDate(slot.date)}</span>
                        <span class="booking-slot-time">${formatClockTime(slot.time)}</span>
                    </span>
                    <span class="poll-vote-meta">${voteLabel}</span>
                </button>
            `;
        })
        .join('');

    container.innerHTML = `
        <div class="poll-page-card booking-poll-card">
            <div class="poll-header">
                <h2 class="poll-title">${pollTitle}</h2>
                <p class="poll-subtitle">Select all times that work for you</p>
            </div>
            <div class="poll-vote-options poll-page-options">
                ${slotsHtml || '<p class="booking-poll-empty">No time options yet.</p>'}
            </div>
        </div>
    `;

    bindHashDismiss();
    if (!isStudent) {
        if (viewer?.role === 'owner' && !activeOwnerViewOnlyToast) {
            activeOwnerViewOnlyToast = showToast({
                content: `
                    <span class="toast-title">You're signed in as a professor</span>
                    <span class="toast-caption">Voting is disabled in this view.</span>
                `,
                dismissable: true,
                timeout: 0,
            });
        }
        return;
    }
    dismissOwnerViewOnlyToast();

    let saveInFlight = false;
    let queuedSave = false;

    const syncSelectionUI = () => {
        container.querySelectorAll('[data-action="toggle-poll-vote"]').forEach((btn) => {
            const slotId = Number(btn.dataset.slotId);
            const selected = selectedIds.has(slotId);
            btn.classList.toggle('is-selected', selected);
            btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
    };

    const setVoteMeta = (slotId) => {
        const btn = container.querySelector(`[data-action="toggle-poll-vote"][data-slot-id="${slotId}"]`);
        const meta = btn?.querySelector('.poll-vote-meta');
        if (!meta) return;
        const n = Math.max(0, voteCounts.get(slotId) ?? 0);
        meta.textContent = voteLabelFor(n);
    };

    const resyncFromServer = async () => {
        try {
            const fresh = await apiFetch(`/group-polls/invite/${token}?viewer=${viewer.id}`);
            const nextSlots = Array.isArray(fresh.slots) ? fresh.slots : [];
            const nextVotes = Array.isArray(fresh.myVotes) ? fresh.myVotes : [];
            selectedIds.clear();
            nextVotes.forEach((id) => selectedIds.add(Number(id)));
            voteCounts.clear();
            nextSlots.forEach((s) => {
                voteCounts.set(Number(s.id), Math.max(0, Number(s.vote_count) || 0));
            });
            syncSelectionUI();
            voteCounts.forEach((_, id) => setVoteMeta(id));
        } catch {
            /* ignore */
        }
    };

    const saveVotes = async () => {
        if (saveInFlight) {
            queuedSave = true;
            return;
        }
        saveInFlight = true;
        container.classList.add('poll-vote-saving');
        try {
            do {
                queuedSave = false;
                await apiFetch(`/group-polls/invite/${token}/vote`, {
                    method: 'POST',
                    body: { viewer_id: viewer.id, slot_ids: [...selectedIds] },
                });
            } while (queuedSave);
        } catch (err) {
            showToast({
                content: `<span>${err.message || 'Could not update your vote.'}</span>`,
                timeout: 2600,
                variant: 'error',
            });
            await resyncFromServer();
        } finally {
            saveInFlight = false;
            container.classList.remove('poll-vote-saving');
        }
    };

    container.addEventListener('click', (e) => {
        const option = e.target.closest('[data-action="toggle-poll-vote"]');
        if (!option || !container.contains(option)) return;
        const slotId = Number(option.dataset.slotId);
        if (!slotId) return;

        const wasSelected = selectedIds.has(slotId);
        if (wasSelected) selectedIds.delete(slotId);
        else selectedIds.add(slotId);
        const prev = voteCounts.get(slotId) ?? 0;
        voteCounts.set(slotId, Math.max(0, prev + (wasSelected ? -1 : 1)));
        syncSelectionUI();
        setVoteMeta(slotId);
        void saveVotes();
    });
};
