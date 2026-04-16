export const API_BASE = '';

export const entryMs = 125;

export const authKey = 'uni-booker-auth';
export const userKey = 'uni-booker-user';
export const usersKey = 'uni-booker-users';
export const signOutAnimateKey = 'uni-booker-signout-animate';
export const themeKey = 'uni-booker-theme';

export const ROLES = {
    owner: { label: 'Owner', initial: 'O' },
    student: { label: 'Student', initial: 'S' },
};

export const getUser = () => {
    try {
        const raw = sessionStorage.getItem(userKey);
        if (!raw) return null;
        const u = JSON.parse(raw);
        return u && typeof u === 'object' ? u : null;
    } catch {
        return null;
    }
};

export const setUser = (user) => {
    sessionStorage.setItem(userKey, JSON.stringify(user));
    let users = [];
    try { users = JSON.parse(sessionStorage.getItem(usersKey)) || []; } catch {}
    users = users.filter(u => u.email !== user.email);
    users.push(user);
    sessionStorage.setItem(usersKey, JSON.stringify(users));
};

export const getAllUsers = () => {
    try {
        return JSON.parse(sessionStorage.getItem(usersKey)) || [];
    } catch {
        return [];
    }
};

export const clearUser = () => {
    const active = getUser();
    sessionStorage.removeItem(userKey);
    if (!active) return;
    
    let users = getAllUsers().filter(u => u.email !== active.email);
    sessionStorage.setItem(usersKey, JSON.stringify(users));
    if (users.length > 0) {
        sessionStorage.setItem(userKey, JSON.stringify(users[users.length - 1]));
    } else {
        sessionStorage.removeItem(authKey);
    }
};

export const APP_TITLE = 'UniBooker';

export const AUTH_PAGE_URL = 'auth.html';
export const MAIN_PAGE_URL = 'main.html';

const fetchText = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return res.text();
};

export const loadPage = async (pageContainer, url) => {
    pageContainer.innerHTML = await fetchText(url);
};

export const appendPage = async (pageContainer, url) => {
    pageContainer.insertAdjacentHTML('beforeend', await fetchText(url));
};

export const syncThemeToggleTitles = () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
        btn.setAttribute('title', isDark ? 'Light mode' : 'Dark mode');
    });
};

let themeClickBound = false;

export const initTheme = () => {
    if (themeClickBound) {
        syncThemeToggleTitles();
        return;
    }
    themeClickBound = true;
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.theme-toggle')) return;
        const nextTheme =
            document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem(themeKey, nextTheme);
        syncThemeToggleTitles();
    });
    syncThemeToggleTitles();
};
