// Dean Barry, Mariana Diaz Betancourt

import {
    ROLES,
    apiFetch,
    appendPage,
    authKey,
    userKey,
    clearUser,
    getUser,
    getAllUsers,
    setUser,
    loadPage,
    signOutAnimateKey,
    syncThemeToggleTitles,
} from './global.js';
import { registerDialog, requestDialogClose, closeAllDialogs } from './dialog.js';
import { mountUpcoming, refreshUpcoming, setUpcomingView } from './upcoming.js';
import { rehydrateBookingViews } from './invite-booking.js';
import { showToast } from './toast.js';
import { escapeHtml, initialsFromEmail } from './format.js';
import { handleSlotManagerClick, handleSlotManagerSubmit, refreshOwnerSlots } from './slot-manager.js';
import { handleBookingManagerClick, refreshDiscoverProfs, refreshPinnedProfs } from './booking-manager.js';
import { refreshNotifications, openNotificationsDialog } from './notifications.js';
import { handlePollManagerClick, refreshOwnerPolls } from './group-poll-manager.js';

const UPCOMING_VIEW_KEY = 'uni-booker-upcoming-view';
const UPCOMING_VIEWS = ['month', 'week'];
const REHYDRATE_MS = 1750;

const loadUpcomingView = () => {
    const saved = localStorage.getItem(UPCOMING_VIEW_KEY);
    return UPCOMING_VIEWS.includes(saved) ? saved : 'month';
};

let rehydrateTimer = null;
let rehydrateInProgress = false;
let interactionGuardBound = false;
let pointerIsDown = false;
let interactionBlockUntil = 0;

const blockRehydrateFor = (ms) => {
    const until = Date.now() + ms;
    if (until > interactionBlockUntil) interactionBlockUntil = until;
};

const shouldPauseRehydrate = () => pointerIsDown || Date.now() < interactionBlockUntil;

const bindInteractionGuard = () => {
    if (interactionGuardBound) return;
    interactionGuardBound = true;

    document.addEventListener('pointerdown', () => {
        pointerIsDown = true;
        blockRehydrateFor(700);
    }, true);

    document.addEventListener('pointerup', () => {
        pointerIsDown = false;
        blockRehydrateFor(350);
    }, true);

    document.addEventListener('pointercancel', () => {
        pointerIsDown = false;
        blockRehydrateFor(350);
    }, true);

    document.addEventListener('click', () => {
        blockRehydrateFor(250);
    }, true);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') blockRehydrateFor(350);
    }, true);
};

const rehydrateDbData = async () => {
    const user = getUser();
    if (!user) return;
    if (rehydrateInProgress) return;
    if (shouldPauseRehydrate()) return;
    rehydrateInProgress = true;
    try {
        const jobs = [refreshUpcoming(), rehydrateBookingViews()];
        if (user.role === 'owner') {
            jobs.push(refreshOwnerSlots());
            jobs.push(refreshOwnerPolls()); //
            jobs.push(refreshNotifications());
        }
        await Promise.all(jobs);
    } catch (err) {
        console.error('Rehydrate failed:', err);
    } finally {
        rehydrateInProgress = false;
    }
};

const startRehydrateLoop = () => {
    if (rehydrateTimer) return;
    bindInteractionGuard();
    void rehydrateDbData();
    rehydrateTimer = setInterval(() => {
        void rehydrateDbData();
    }, REHYDRATE_MS);
};

const applyUpcomingView = (view) => {
    const appView = document.getElementById('view-app');
    if (!appView) return;
    const card = appView.querySelector('.card-upcoming');
    if (card) card.setAttribute('data-upcoming-view', view);

    appView.querySelectorAll('.view-switcher-option[role="tab"]').forEach((tab) => {
        const isSelected = tab.dataset.view === view;
        tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        tab.tabIndex = isSelected ? 0 : -1;
    });

    setUpcomingView(view);
};

const selectUpcomingView = (view) => {
    localStorage.setItem(UPCOMING_VIEW_KEY, view);
    applyUpcomingView(view);
};

let viewSwitcherBound = false;

const bindViewSwitcher = () => {
    if (viewSwitcherBound) return;
    const tablist = document.querySelector('#view-app .view-switcher[role="tablist"]');
    if (!tablist) return;
    viewSwitcherBound = true;

    applyUpcomingView(loadUpcomingView());

    tablist.addEventListener('click', (e) => {
        const tab = e.target.closest('.view-switcher-option[role="tab"]');
        if (!tab || !tablist.contains(tab)) return;
        const view = tab.dataset.view;
        if (!UPCOMING_VIEWS.includes(view)) return;
        selectUpcomingView(view);
        tab.focus();
    });

    tablist.addEventListener('keydown', (e) => {
        const tabs = [...tablist.querySelectorAll('.view-switcher-option[role="tab"]')];
        if (!tabs.length) return;
        const currentIndex = tabs.indexOf(document.activeElement);
        let nextIndex = -1;

        if (e.key === 'Home') nextIndex = 0;
        else if (e.key === 'End') nextIndex = tabs.length - 1;
        else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            const dir = e.key === 'ArrowRight' ? 1 : -1;
            const from = currentIndex >= 0
                ? currentIndex
                : tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
            nextIndex = (from + dir + tabs.length) % tabs.length;
        }

        if (nextIndex < 0) return;
        e.preventDefault();
        const view = tabs[nextIndex].dataset.view;
        if (!UPCOMING_VIEWS.includes(view)) return;
        selectUpcomingView(view);
        tabs[nextIndex].focus();
    });
};

const bindWordmarkReload = () => {
    document.querySelector('#view-app .topbar .wordmark')?.addEventListener('click', () => {
        location.reload();
    });
};

const toast = (message, { error = false, duration = 2200 } = {}) => {
    showToast({
        content: `<span>${escapeHtml(message)}</span>`,
        timeout: duration,
        variant: error ? 'error' : 'default',
    });
};

export const ensureMainPage = async (pageContainer, { append = false } = {}) => {
    if (document.getElementById('view-app')) return;
    if (append) await appendPage(pageContainer, 'main.html');
    else await loadPage(pageContainer, 'main.html');
    syncThemeToggleTitles();
    bindWordmarkReload();

    const user = getUser();
    refreshUserUI(user);
    bindAccountMenu();
    bindViewSwitcher();
    bindAppActions();
    bindDialogClose();
    startRehydrateLoop();
    void refreshCards(user);
};

export const getAppView = () => {
    const appView = document.getElementById('view-app');
    if (!appView) throw new Error('main page not mounted');
    return appView;
};

const refreshUserUI = (user) => {
    const appView = document.getElementById('view-app');
    const inviteView = document.getElementById('view-invite');

    const role = user && ROLES[user.role] ? user.role : 'student';
    const meta = ROLES[role];
    const initial = initialsFromEmail(user?.email, meta.initial);

    if (appView) appView.setAttribute('data-role-view', role);
    if (inviteView) inviteView.setAttribute('data-role-view', role);

    document.querySelectorAll('.avatar-initial').forEach((el) => {
        el.textContent = initial;
    });

    const allUsers = getAllUsers();
    let html = '';

    if (user) {
        html += `
            <div class="account-row account-identity" role="presentation" aria-checked="true">
                <span class="account-avatar"><span class="account-avatar-initial">${initial}</span></span>
                <span class="account-meta">
                    <span class="account-name account-email">${user.email}</span>
                    <span class="account-role">${meta.label}</span>
                </span>
            </div>
        `;
    }

    const otherUsers = allUsers.filter(u => u.email !== user?.email);
    if (otherUsers.length > 0) {
        html += `<div class="account-divider"></div>`;
        otherUsers.forEach(u => {
            const uInitial = initialsFromEmail(u.email);
            const uMeta = ROLES[u.role] || ROLES.student;
            html += `
                <button type="button" class="account-row account-switch" data-email="${u.email}" role="menuitem">
                    <span class="account-avatar"><span class="account-avatar-initial">${uInitial}</span></span>
                    <span class="account-meta">
                        <span class="account-name">${u.email}</span>
                        <span class="account-role">${uMeta.label}</span>
                    </span>
                </button>
            `;
        });
    }

    html += `
        <div class="account-divider"></div>
        <button type="button" class="account-row account-add" role="menuitem">
            <svg class="account-signout-icon" width="16" height="16" viewBox="0 0 24 24"><use href="assets/icons.svg#plus" /></svg>
            <span class="account-name">Add account</span>
        </button>
        <button type="button" class="account-row account-signout" role="menuitem">
            <svg class="account-signout-icon" width="16" height="16" viewBox="0 0 24 24"><use href="assets/icons.svg#log-out" /></svg>
            <span class="account-name">Sign out</span>
        </button>
    `;

    document.querySelectorAll('.account-menu').forEach((menu) => {
        menu.innerHTML = html;
    });
};

let accountMenuBound = false;

const bindAccountMenu = () => {
    if (accountMenuBound) return;
    accountMenuBound = true;

    const closeAllMenus = () => {
        document.querySelectorAll('.account-menu').forEach((menu) => {
            if (menu.hidden) return;
            menu.hidden = true;
            menu.parentElement?.querySelector('.avatar')?.setAttribute('aria-expanded', 'false');
        });
    };

    document.addEventListener('click', (e) => {
        const avatar = e.target.closest('.account .avatar');
        if (avatar) {
            const menu = avatar.parentElement.querySelector('.account-menu');
            if (!menu) return;
            const wasOpen = !menu.hidden;
            closeAllMenus();
            if (!wasOpen) {
                menu.hidden = false;
                avatar.setAttribute('aria-expanded', 'true');
            }
            return;
        }

        const addAcc = e.target.closest('.account-add');
        if (addAcc) {
            closeAllMenus();
            sessionStorage.removeItem(authKey);
            sessionStorage.removeItem(userKey);
            location.replace('#/signin');
            return;
        }

        const switchAcc = e.target.closest('.account-switch');
        if (switchAcc) {
            const email = switchAcc.dataset.email;
            const targetUser = getAllUsers().find(u => u.email === email);
            if (targetUser) {
                closeAllMenus();
                setUser(targetUser);
                location.reload();
            }
            return;
        }

        const signout = e.target.closest('.account-signout');
        if (signout) {
            closeAllMenus();
            closeAllDialogs();
            sessionStorage.setItem(signOutAnimateKey, '1');
            clearUser();
            if (!sessionStorage.getItem(authKey)) location.hash = '#/signin';
            location.reload();
            return;
        }

        if (!e.target.closest('.account-menu')) closeAllMenus();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllMenus();
    });
};

let dialogCloseBound = false;
const bindDialogClose = () => {
    if (dialogCloseBound) return;
    dialogCloseBound = true;

    document.addEventListener('click', (e) => {
        const closer = e.target.closest('[data-action="close-dialog"]');
        if (closer) {
            const dlg = closer.closest('dialog.ui-dialog');
            if (dlg?.open) void requestDialogClose(dlg);
        }
    });

    document.querySelectorAll('#view-app dialog.ui-dialog').forEach((dlg) => {
        registerDialog(dlg);
    });
};

let appActionsBound = false;

const bindAppActions = () => {
    if (appActionsBound) return;
    appActionsBound = true;

    document.addEventListener('click', async (e) => {
        if (!e.target.closest('#view-app')) return;

        if (e.target.closest('[data-action="open-notifications"]')) {
            await openNotificationsDialog();
            return;
        }

        if (await handleSlotManagerClick(e, { toast })) return;
        if (await handlePollManagerClick(e, { toast })) return; //
        if (await handleBookingManagerClick(e, { toast })) return;

        const cancelUp = e.target.closest('[data-action="cancel-upcoming"]');
        if (cancelUp) {
            const bookingId = Number(cancelUp.dataset.bookingId);
            const user = getUser();
            const isOwner = user?.role === 'owner';
            const msg = isOwner
                ? 'Remove this appointment? The student will be notified.'
                : 'Cancel this booking? The professor will be notified.';
            if (!confirm(msg)) return;
            try {
                await apiFetch(`/bookings/${bookingId}`, {
                    method: 'DELETE',
                    body: { cancelled_by_role: isOwner ? 'owner' : 'student' },
                });
                await refreshUpcoming();
                if (isOwner) await refreshOwnerSlots();
            } catch (err) {
                toast(err.message || 'Failed to cancel', { error: true });
            }
        }
    });

    document.addEventListener('submit', handleSlotManagerSubmit);

    window.addEventListener('booking-changed', () => {
        void rehydrateDbData();
    });
};

const refreshCards = async (user) => {
    if (!user) return;
    if (user.role === 'owner') {
        await refreshOwnerSlots();
        await refreshOwnerPolls();
    } else if (user.role === 'student') {
        const pinnedIds = await refreshPinnedProfs();
        await refreshDiscoverProfs(pinnedIds);
    }
    await mountUpcoming(loadUpcomingView());
};
