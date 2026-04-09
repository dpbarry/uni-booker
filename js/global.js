export const fadeOutMs = 55;
export const fadeInMs = 70;
export const entryMs = fadeOutMs + fadeInMs;

export const authKey = 'uni-booker-auth';
export const themeKey = 'uni-booker-theme';

export const APP_TITLE = 'UniBooker';
export const PANEL_TITLE = { dashboard: 'Dashboard', calendar: 'Calendar' };

export const AUTH_PAGE_URL = 'auth.html';
export const MAIN_PAGE_URL = 'main.html';

export const panelUrls = { dashboard: 'dashboard.html', calendar: 'calendar.html' };

const parser = new DOMParser();

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

export const segment = () =>
    (location.hash.slice(1).replace(/^\/?/, '') || 'signin').split('/')[0];

export const panelId = () => {
    const value = segment();
    if (value === 'signin') return null;
    return value in panelUrls ? value : 'dashboard';
};

const mountPanel = (html) => {
    const doc = parser.parseFromString(html, 'text/html');
    const panel = document.createElement('div');
    panel.className = 'panel';
    doc.body.childNodes.forEach((node) => panel.appendChild(node));
    panel.querySelectorAll('script').forEach((script) => {
        const next = document.createElement('script');
        if (script.src) next.src = script.src;
        else next.textContent = script.textContent;
        if (script.type) next.type = script.type;
        script.replaceWith(next);
    });
    return panel;
};

export const fetchPanel = async (name) => {
    const url = panelUrls[name];
    if (!url) throw new Error(`unknown panel: ${name}`);
    return mountPanel(await fetchText(url));
};

export const crossfade = (prev, next) =>
    new Promise((resolve) => {
        if (!prev) {
            next.style.opacity = '1';
            resolve();
            return;
        }
        next.style.opacity = '0';
        prev.classList.add('fade-out');
        setTimeout(() => {
            prev.remove();
            next.style.opacity = '';
            next.classList.add('fade-in');
            setTimeout(() => {
                next.classList.remove('fade-in');
                resolve();
            }, fadeInMs);
        }, fadeOutMs);
    });

let progressEl = null;
let progressTimer = null;

export const progress = {
    start() {
        clearTimeout(progressTimer);
        progressEl?.remove();
        progressTimer = setTimeout(() => {
            progressEl = Object.assign(document.createElement('div'), { className: 'progress' });
            document.body.appendChild(progressEl);
            void progressEl.offsetWidth;
            progressEl.classList.add('run');
        }, 20);
    },
    stop() {
        clearTimeout(progressTimer);
        if (!progressEl) return;
        progressEl.classList.remove('run');
        progressEl.classList.add('done');
        const el = progressEl;
        progressEl = null;
        setTimeout(() => el.remove(), 350);
    },
};

export const syncThemeToggleTitles = () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('.js-theme-toggle').forEach((btn) => {
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
        if (!e.target.closest('.js-theme-toggle')) return;
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
