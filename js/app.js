import {
  APP_TITLE,
  PANEL_TITLE,
  authKey,
  crossfade,
  entryMs,
  fetchPanel,
  initTheme,
  panelId,
  progress,
  segment,
} from './global.js';
import { ensureAuthPage } from './auth.js';
import { ensureMainPage, getMainPageRefs, setActiveNav } from './main.js';

const pageContainer = document.getElementById('page-container');

const state = {
  busy: false,
  pendingPanel: null,
  activePanel: null,
  animateNextMainEntry: false,
};

const isAuthed = () => sessionStorage.getItem(authKey) === '1';

const syncDocTitle = () => {
  if (!isAuthed()) {
    document.title = APP_TITLE;
    return;
  }
  const id = panelId();
  const label = id && PANEL_TITLE[id];
  document.title = label ? `${APP_TITLE} · ${label}` : APP_TITLE;
};

const withNavigationLock = async (task) => {
  state.busy = true;
  try {
    await task();
  } finally {
    state.busy = false;
    if (state.pendingPanel) {
      const queued = state.pendingPanel;
      state.pendingPanel = null;
      void showPanel(queued);
    }
  }
};

const onSignIn = () => {
  sessionStorage.setItem(authKey, '1');
  state.animateNextMainEntry = true;
  location.replace('#/dashboard');
};

async function showPanel(panelName) {
  if (state.busy) {
    state.pendingPanel = panelName;
    setActiveNav(panelName);
    return;
  }

  const previousPanel = state.activePanel;

  await withNavigationLock(async () => {
    setActiveNav(panelName);
    progress.start();

    try {
      const nextPanel = await fetchPanel(panelName);
      const { panelRoot } = getMainPageRefs();
      const previousNode = panelRoot.querySelector('.panel');
      panelRoot.appendChild(nextPanel);
      progress.stop();
      await crossfade(previousNode, nextPanel);
      state.activePanel = panelName;
    } catch (error) {
      progress.stop();
      if (previousPanel) setActiveNav(previousPanel);
      throw error;
    }
  });
}

async function enterMainPage(panelName) {
  if (state.busy) return;

  const animateEntry = state.animateNextMainEntry;
  state.animateNextMainEntry = false;
  const previousPanel = state.activePanel;

  await withNavigationLock(async () => {
    await ensureMainPage(pageContainer, { append: animateEntry });

    const { appView, panelRoot } = getMainPageRefs();

    if (animateEntry) progress.start();
    else {
      document.documentElement.classList.remove('first-paint-main');
      appView.classList.add('is-visible');
      document.getElementById('view-auth')?.classList.remove('is-visible');
    }

    setActiveNav(panelName);

    try {
      const nextPanel = await fetchPanel(panelName);
      const previousNode = panelRoot.querySelector('.panel');
      panelRoot.appendChild(nextPanel);

      if (animateEntry) {
        progress.stop();
        appView.classList.add('from-signin-layer');
        document.body.classList.add('main-entry-animation');
        await new Promise((resolve) => setTimeout(resolve, entryMs));
        document.body.classList.remove('main-entry-animation');
        appView.classList.remove('from-signin-layer');
        document.documentElement.classList.remove('first-paint-main');
        appView.classList.add('is-visible');
        document.getElementById('view-auth')?.remove();
      } else {
        await crossfade(previousNode, nextPanel);
      }

      state.activePanel = panelName;
    } catch (error) {
      if (animateEntry) progress.stop();
      if (previousPanel) setActiveNav(previousPanel);
      throw error;
    }
  });
}

const route = async () => {
  syncDocTitle();
  if (state.busy) return;

  if (!isAuthed()) {
    if (segment() !== 'signin') {
      location.replace('#/signin');
      return;
    }
    await ensureAuthPage(pageContainer, onSignIn);
    state.activePanel = null;
    return;
  }

  const nextPanel = panelId();
  if (!nextPanel) {
    location.replace('#/dashboard');
    return;
  }

  const appView = document.getElementById('view-app');
  if (!appView || !appView.classList.contains('is-visible')) {
    await enterMainPage(nextPanel);
    return;
  }

  if (nextPanel === state.activePanel) {
    setActiveNav(nextPanel);
    return;
  }

  await showPanel(nextPanel);
};

const failHard = (error) => {
  pageContainer.textContent = 'Failed to load UI.';
  console.error(error);
};

const runRoute = () => route().catch(failHard);

initTheme();
window.addEventListener('hashchange', runRoute);

(async () => {
  try {
    if (isAuthed()) await ensureMainPage(pageContainer);
    else await ensureAuthPage(pageContainer, onSignIn);
  } catch (error) {
    failHard(error);
    return;
  }

  const emptyHash = !location.hash || location.hash === '#' || location.hash === '#/';
  if (emptyHash) location.replace(isAuthed() ? '#/dashboard' : '#/signin');
  else await route();
})();
