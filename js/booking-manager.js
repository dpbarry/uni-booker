import { apiFetch, getUser } from './global.js';
import { openBookingDialog } from './invite-booking.js';
import { escapeHtml, initialsFromEmail } from './format.js';

const loadList = async (path, label) => {
    try {
        return await apiFetch(path);
    } catch (err) {
        console.error(`Error loading ${label}:`, err);
        return [];
    }
};

const renderProfRow = (prof, pinned, clickable) => `
    <li class="prof-row" data-clickable="${clickable}">
        <button type="button" class="prof-body" data-action="open-prof" data-owner-id="${prof.id}">
            <span class="prof-avatar">${initialsFromEmail(prof.email)}</span>
            <span class="prof-email">${escapeHtml(prof.email)}</span>
        </button>
        <button type="button" class="pin-button" data-action="toggle-pin" data-owner-id="${prof.id}" aria-pressed="${pinned}" title="${pinned ? 'Unpin' : 'Pin'}">
            <svg width="14" height="14" viewBox="0 0 24 24"><use href="assets/icons.svg#${pinned ? 'x' : 'pin'}" /></svg>
        </button>
    </li>
`;

export const refreshPinnedProfs = async () => {
    const user = getUser();
    if (!user || user.role !== 'student') return new Set();
    const section = document.querySelector('[data-section="pinned"]');
    if (!section) return new Set();
    const list = section.querySelector('.prof-list');
    const empty = section.querySelector('[data-empty="pinned"]');

    const profs = await loadList(`/pins/${user.id}`, 'pins');
    const pinnedIds = new Set(profs.map((p) => p.id));

    if (!profs.length) {
        list.hidden = true;
        list.innerHTML = '';
        empty.hidden = false;
        return pinnedIds;
    }
    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = profs.map((p) => renderProfRow(p, true, true)).join('');
    return pinnedIds;
};

export const refreshDiscoverProfs = async (pinnedIds = new Set()) => {
    const user = getUser();
    if (!user || user.role !== 'student') return;
    const section = document.querySelector('[data-section="discover"]');
    if (!section) return;
    const list = section.querySelector('.prof-list');
    const empty = section.querySelector('[data-empty="discover"]');

    const profs = await loadList('/owners', 'directory');

    const discoverable = profs.filter((p) => !pinnedIds.has(p.id));
    if (!discoverable.length) {
        list.hidden = true;
        list.innerHTML = '';
        empty.hidden = false;
        return;
    }

    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = discoverable.map((p) => renderProfRow(p, false, true)).join('');
};

export const handleBookingManagerClick = async (e, { toast }) => {
    const pinBtn = e.target.closest('[data-action="toggle-pin"]');
    if (pinBtn) {
        const user = getUser();
        if (!user || user.role !== 'student') return true;
        const ownerId = Number(pinBtn.dataset.ownerId);
        const pinned = pinBtn.getAttribute('aria-pressed') === 'true';
        try {
            if (pinned) {
                await apiFetch(`/pins/${user.id}/${ownerId}`, { method: 'DELETE' });
            } else {
                await apiFetch('/pins', { method: 'POST', body: { student_id: user.id, owner_id: ownerId } });
            }
            const pinnedIds = await refreshPinnedProfs();
            await refreshDiscoverProfs(pinnedIds);
        } catch (err) {
            toast(err.message || 'Failed to update pin', { error: true });
        }
        return true;
    }

    const profBody = e.target.closest('[data-action="open-prof"]');
    if (profBody) {
        const ownerId = Number(profBody.dataset.ownerId);
        try {
            await openBookingDialog({ ownerId, mode: 'modal' });
        } catch (err) {
            toast(err.message || 'Failed to open', { error: true });
        }
        
        return true;
    }

    return false;
};
