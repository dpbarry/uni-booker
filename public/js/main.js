import { MAIN_PAGE_URL, appendPage, loadPage, syncThemeToggleTitles } from './global.js';

export const ensureMainPage = async (pageContainer, { append = false } = {}) => {
    if (document.getElementById('view-app')) return;
    if (append) await appendPage(pageContainer, MAIN_PAGE_URL);
    else await loadPage(pageContainer, MAIN_PAGE_URL);
    syncThemeToggleTitles();
};

export const getAppView = () => {
    const appView = document.getElementById('view-app');
    if (!appView) throw new Error('main page not mounted');
    return appView;
};
