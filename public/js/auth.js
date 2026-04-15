import { AUTH_PAGE_URL, loadPage, syncThemeToggleTitles } from './global.js';

export const ensureAuthPage = async (pageContainer, onSignIn) => {
    if (!document.getElementById('view-auth')) {
        await loadPage(pageContainer, AUTH_PAGE_URL);
    }
    const signInButton = document.getElementById('auth-signin-button');
    if (signInButton) signInButton.onclick = onSignIn;
    syncThemeToggleTitles();
};
