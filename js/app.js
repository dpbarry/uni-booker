import { APP_TITLE, authKey, entryMs, initTheme } from './global.js';
import { ensureAuthPage } from './auth.js';
import { ensureMainPage, getAppView } from './main.js';

const pageContainer = document.getElementById('page-container');

const state = {
  busy: false,
  animateNextEntry: false,
};

const isAuthed = () => sessionStorage.getItem(authKey) === '1';

const onSignIn = () => {
  sessionStorage.setItem(authKey, '1');
  state.animateNextEntry = true;
  location.replace('#/');
};

async function enterMainPage() {
  state.busy = true;
  const animate = state.animateNextEntry;
  state.animateNextEntry = false;

  try {
    await ensureMainPage(pageContainer, { append: animate });
    const appView = getAppView();

    if (animate) {
      appView.classList.add('from-signin-layer');
      document.body.classList.add('main-entry-animation');
      await new Promise((r) => setTimeout(r, entryMs));
      document.body.classList.remove('main-entry-animation');
      appView.classList.remove('from-signin-layer');
    }

    document.documentElement.classList.remove('first-paint-main');
    appView.classList.add('is-visible');
    document.getElementById('view-auth')?.remove();
  } finally {
    state.busy = false;
  }
}

const route = async () => {
  document.title = APP_TITLE;
  if (state.busy) return;

  if (!isAuthed()) {
    if (location.hash !== '#/signin') {
      location.replace('#/signin');
      return;
    }
    await ensureAuthPage(pageContainer, onSignIn);
    return;
  }

  if (location.hash && location.hash !== '#/') {
    location.replace('#/');
    return;
  }

  const appView = document.getElementById('view-app');
  if (!appView || !appView.classList.contains('is-visible')) {
    await enterMainPage();
  }
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

  const hash = location.hash;
  if (isAuthed() && hash !== '#/') location.replace('#/');
  else if (!isAuthed() && hash !== '#/signin') location.replace('#/signin');
  else await route();
})();
