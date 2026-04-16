import {
    API_BASE,
    MAIN_PAGE_URL,
    ROLES,
    appendPage,
    authKey,
    clearUser,
    getUser,
    loadPage,
    signOutAnimateKey,
    syncThemeToggleTitles,
} from './global.js';

const UPCOMING_VIEW_KEY = 'uni-booker-upcoming-view';
const UPCOMING_VIEWS = ['month', 'week'];

const getSavedUpcomingView = () => {
    const v = localStorage.getItem(UPCOMING_VIEW_KEY);
    if (v && UPCOMING_VIEWS.includes(v)) return v;
    return 'month';
};

const setSavedUpcomingView = (view) => {
    if (!UPCOMING_VIEWS.includes(view)) return;
    localStorage.setItem(UPCOMING_VIEW_KEY, view);
};

const applyUpcomingView = (view) => {
    const appView = document.getElementById('view-app');
    if (!appView) return;
    const resolved = UPCOMING_VIEWS.includes(view) ? view : 'month';
    const card = appView.querySelector('.card-full');
    if (card) card.setAttribute('data-upcoming-view', resolved);

    appView.querySelectorAll('.view-switcher-option[role="tab"]').forEach((tab) => {
        const isSelected = tab.dataset.view === resolved;
        tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        tab.tabIndex = isSelected ? 0 : -1;
    });

    appView.dispatchEvent(
        new CustomEvent('upcomingviewchange', { detail: { view: resolved }, bubbles: true }),
    );
};

let viewSwitcherBound = false;

const bindViewSwitcher = () => {
    if (viewSwitcherBound) return;
    const tablist = document.querySelector('#view-app .view-switcher[role="tablist"]');
    if (!tablist) return;
    viewSwitcherBound = true;

    applyUpcomingView(getSavedUpcomingView());

    tablist.addEventListener('click', (e) => {
        const tab = e.target.closest('.view-switcher-option[role="tab"]');
        if (!tab || !tablist.contains(tab)) return;
        const view = tab.dataset.view;
        if (!view || !UPCOMING_VIEWS.includes(view)) return;
        setSavedUpcomingView(view);
        applyUpcomingView(view);
        tab.focus();
    });

    tablist.addEventListener('keydown', (e) => {
        const tabs = [...tablist.querySelectorAll('.view-switcher-option[role="tab"]')];
        if (!tabs.length) return;
        const i = tabs.indexOf(document.activeElement);
        if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            const next = e.key === 'Home' ? 0 : tabs.length - 1;
            const view = tabs[next].dataset.view;
            if (!view) return;
            setSavedUpcomingView(view);
            applyUpcomingView(view);
            tabs[next].focus();
            return;
        }
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const from = i >= 0 ? i : tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
        const next = (from + dir + tabs.length) % tabs.length;
        const view = tabs[next].dataset.view;
        if (!view) return;
        setSavedUpcomingView(view);
        applyUpcomingView(view);
        tabs[next].focus();
    });
};

const bindWordmarkRefresh = () => {
    document.querySelector('#view-app .topbar .wordmark')?.addEventListener('click', () => {
        location.reload();
    });
};

export const ensureMainPage = async (pageContainer, { append = false } = {}) => {
    if (document.getElementById('view-app')) return;
    if (append) await appendPage(pageContainer, MAIN_PAGE_URL);
    else await loadPage(pageContainer, MAIN_PAGE_URL);
    syncThemeToggleTitles();
    bindWordmarkRefresh();

    const user = getUser();
    applyUserToUI(user);
    bindAccountMenu();
    bindViewSwitcher();
    bindCardActions();
    void hydrateCards(user);
};

export const getAppView = () => {
    const appView = document.getElementById('view-app');
    if (!appView) throw new Error('main page not mounted');
    return appView;
};

const applyUserToUI = (user) => {
    const appView = document.getElementById('view-app');
    if (!appView) return;

    const role = user && ROLES[user.role] ? user.role : 'student';
    const meta = ROLES[role];

    appView.setAttribute('data-role-view', role);

    const initial = (user?.email?.[0] || meta.initial).toUpperCase();
    const avatarInitial = appView.querySelector('.avatar-initial');
    if (avatarInitial) avatarInitial.textContent = initial;
    const accountAvatarInitial = appView.querySelector('.account-avatar-initial');
    if (accountAvatarInitial) accountAvatarInitial.textContent = initial;

    const emailEl = appView.querySelector('.account-email');
    if (emailEl) emailEl.textContent = user?.email || 'Not signed in';
    const roleEl = appView.querySelector('.account-identity .account-role');
    if (roleEl) roleEl.textContent = meta.label;
};

let accountMenuBound = false;

const bindAccountMenu = () => {
    if (accountMenuBound) return;
    accountMenuBound = true;

    const getMenu = () => document.querySelector('.account-menu');
    const getAvatar = () => document.querySelector('.avatar');

    const closeMenu = () => {
        const menu = getMenu();
        if (!menu || menu.hidden) return;
        menu.hidden = true;
        getAvatar()?.setAttribute('aria-expanded', 'false');
    };

    const openMenu = () => {
        const menu = getMenu();
        if (!menu) return;
        menu.hidden = false;
        getAvatar()?.setAttribute('aria-expanded', 'true');
    };

    document.addEventListener('click', (e) => {
        const avatar = e.target.closest('.avatar');
        if (avatar) {
            const menu = getMenu();
            if (!menu) return;
            if (menu.hidden) openMenu();
            else closeMenu();
            return;
        }

        const signout = e.target.closest('.account-signout');
        if (signout) {
            closeMenu();
            sessionStorage.setItem(signOutAnimateKey, '1');
            sessionStorage.removeItem(authKey);
            clearUser();
            location.replace('#/signin');
            return;
        }

        if (!e.target.closest('.account-menu')) closeMenu();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
    });
};

const cardActionsBound = false;

const bindCardActions = () => {
    if (cardActionsBound) return;
    cardActionsBound = true;

    document.addEventListener('click', async (e) => {
        const newSlotBtn = e.target.closest('[data-action="new-slot"]');
        if (newSlotBtn) {
            const form = document.querySelector('.card-slots .slot-form');
            if (form) form.hidden = false;
            return;
        }

        const cancelBtn = e.target.closest('[data-action="cancel-slot"]');
        if (cancelBtn) {
            const form = cancelBtn.closest('.slot-form');
            if (form) {
                form.hidden = true;
                form.reset();
            }
            return;
        }

        const toggleBtn = e.target.closest('[data-action="toggle-slot"]');
        if (toggleBtn) {
            const id = Number(toggleBtn.dataset.id);
            try {
                const response = await fetch(`${API_BASE}/slots/${id}/toggle`, {
                    method: 'PUT',
                });
                const data = await response.json();
                if (!response.ok) {
                    alert(data.error || 'Failed to toggle slot');
                    return;
                }
                await renderOwnerSlots();
            } catch (err) {
                console.error('Error toggling slot:', err);
                alert('Server error');
            }
            return;
        }

        const deleteBtn = e.target.closest('[data-action="delete-slot"]');
        if (deleteBtn) {
            const id = Number(deleteBtn.dataset.id);
            if (!confirm('Delete this slot?')) return;
            try {
                const response = await fetch(`${API_BASE}/slots/${id}`, {
                    method: 'DELETE',
                });
                const data = await response.json();
                if (!response.ok) {
                    alert(data.error || 'Failed to delete slot');
                    return;
                }
                await renderOwnerSlots();
            } catch (err) {
                console.error('Error deleting slot:', err);
                alert('Server error');
            }
            return;
        }

        const bookBtn = e.target.closest('[data-action="book-slot"]');
        if (bookBtn) {
            const user = getUser();
            if (!user || user.role !== 'student') {
                alert('Only students can book slots.');
                return;
            }
            const id = Number(bookBtn.dataset.id);
            try {
                const response = await fetch(`${API_BASE}/bookings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ student_id: user.id, slot_id: id }),
                });
                const data = await response.json();
                if (!response.ok) {
                    alert(data.error || 'Booking failed');
                    return;
                }
                await renderActiveSlots();
                alert('Booked.');
            } catch (err) {
                console.error('Error booking slot:', err);
                alert('Server error');
            }
            return;
        }
    });

    document.addEventListener('submit', async (e) => {
        const form = e.target.closest('.card-slots .slot-form');
        if (!form) return;
        e.preventDefault();
        const user = getUser();
        if (!user || user.role !== 'owner') return;
        const data = new FormData(form);
        const date = data.get('date');
        const time = data.get('time');
        if (!date || !time) return;
        try {
            const response = await fetch(`${API_BASE}/slots/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ owner_id: user.id, date, time: `${time}:00` }),
            });
            const body = await response.json();
            if (!response.ok) {
                alert(body.error || 'Failed to create slot');
                return;
            }
            form.reset();
            form.hidden = true;
            await renderOwnerSlots();
        } catch (err) {
            console.error('Error creating slot:', err);
            alert('Server error');
        }
    });
};

const formatDate = (raw) => {
    if (!raw) return '';
    return String(raw).split('T')[0];
};

const formatTime = (raw) => {
    if (!raw) return '';
    return String(raw).slice(0, 5);
};

const renderOwnerSlots = async () => {
    const user = getUser();
    if (!user || user.role !== 'owner') return;
    const card = document.querySelector('.card-slots');
    if (!card) return;
    const list = card.querySelector('.slot-list');
    const empty = card.querySelector('.empty-state');

    let slots = [];
    try {
        const response = await fetch(`${API_BASE}/slots/owner/${user.id}`);
        slots = await response.json();
        if (!response.ok) throw new Error(slots?.error || 'Failed to load slots');
    } catch (err) {
        console.error('Error loading owner slots:', err);
        return;
    }

    if (!slots.length) {
        list.hidden = true;
        list.innerHTML = '';
        empty.hidden = false;
        return;
    }

    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = slots
        .map((slot) => `
            <li class="slot-row" data-id="${slot.id}">
                <span class="slot-when">${formatDate(slot.date)} · ${formatTime(slot.time)}</span>
                <span class="slot-status">${slot.active ? 'Active' : 'Hidden'}</span>
                <button type="button" data-action="toggle-slot" data-id="${slot.id}">${slot.active ? 'Deactivate' : 'Activate'}</button>
                <button type="button" data-action="delete-slot" data-id="${slot.id}">Delete</button>
            </li>
        `)
        .join('');
};

const renderActiveSlots = async () => {
    const card = document.querySelector('.card-pinned');
    if (!card) return;
    const list = card.querySelector('.slot-list');
    const empty = card.querySelector('.empty-state');

    let slots = [];
    try {
        const response = await fetch(`${API_BASE}/slots/active`);
        slots = await response.json();
        if (!response.ok) throw new Error(slots?.error || 'Failed to load slots');
    } catch (err) {
        console.error('Error loading active slots:', err);
        return;
    }

    if (!slots.length) {
        list.hidden = true;
        list.innerHTML = '';
        empty.hidden = false;
        return;
    }

    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = slots
        .map((slot) => `
            <li class="slot-row" data-id="${slot.id}">
                <span class="slot-when">${formatDate(slot.date)} · ${formatTime(slot.time)}</span>
                <button type="button" data-action="book-slot" data-id="${slot.id}">Book</button>
            </li>
        `)
        .join('');
};

const hydrateCards = async (user) => {
    if (!user) return;
    if (user.role === 'owner') await renderOwnerSlots();
    else if (user.role === 'student') await renderActiveSlots();
};
