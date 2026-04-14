export const fadeOutMs = 55;
export const fadeInMs = 70;
export const entryMs = fadeOutMs + fadeInMs;

export const authKey = 'uni-booker-auth';
export const themeKey = 'uni-booker-theme';

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
        try {
            localStorage.setItem(themeKey, nextTheme);
        } catch {}
        syncThemeToggleTitles();
    });
    syncThemeToggleTitles();
};
