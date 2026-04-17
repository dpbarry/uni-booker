import { APP_TITLE, authKey, entryMs, initTheme, pendingInviteKey, signOutAnimateKey } from './global.js';
import { ensureAuthPage } from './auth.js';
import { ensureMainPage, getAppView } from './main.js';
import { openBookingDialog } from './invite-booking.js';

const pageContainer = document.getElementById('page-container');

const state = {
  busy: false,
  animateNextEntry: false,
};

const isAuthed = () => sessionStorage.getItem(authKey) === '1';
const setHash = (hash) => location.replace(hash);

const parseInviteToken = (hash) => {
  const m = /^#\/invite\/(.+)$/.exec(hash || '');
  return m ? decodeURIComponent(m[1]) : null;
};

const onSignIn = () => {
  state.animateNextEntry = true;
  const pending = sessionStorage.getItem(pendingInviteKey);
  if (pending) {
    sessionStorage.removeItem(pendingInviteKey);
    setHash(`#/invite/${pending}`);
    return;
  }
  setHash('#/');
};

const showTopPage = (which) => {
  const app = document.getElementById('view-app');
  const invite = document.getElementById('view-invite');
  if (app) app.hidden = which !== 'app';
  if (invite) invite.hidden = which !== 'invite';
};

async function enterMainPage() {
  state.busy = true;
  const animate = state.animateNextEntry;
  state.animateNextEntry = false;

  try {
    await ensureMainPage(pageContainer, { append: animate });
    const appView = getAppView();
    showTopPage('app');

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

async function enterInvitePage(token) {
  state.busy = true;
  state.animateNextEntry = false;
  try {
    await ensureMainPage(pageContainer);
    showTopPage('invite');
    const inviteView = document.getElementById('view-invite');
    if (inviteView) inviteView.classList.add('is-visible');
    document.documentElement.classList.remove('first-paint-main');
    document.getElementById('view-auth')?.remove();
    await openBookingDialog({ token, mode: 'page' });
  } finally {
    state.busy = false;
  }
}

const route = async () => {
  document.title = APP_TITLE;
  if (state.busy) return;

  const inviteToken = parseInviteToken(location.hash);

  if (!isAuthed()) {
    if (inviteToken) {
      sessionStorage.setItem(pendingInviteKey, inviteToken);
      setHash('#/signin');
      return;
    }
    if (location.hash !== '#/signin') {
      setHash('#/signin');
      return;
    }
    state.busy = true;
    try {
      let animateReturn = sessionStorage.getItem(signOutAnimateKey) === '1';
      if (animateReturn) sessionStorage.removeItem(signOutAnimateKey);

      await ensureAuthPage(pageContainer, onSignIn, { append: animateReturn });

      if (animateReturn) {
        const authView = document.getElementById('view-auth');
        const appView = document.getElementById('view-app');
        if (authView && appView) {
          document.body.classList.add('auth-return-animation');
          await new Promise((r) => setTimeout(r, entryMs));
          document.body.classList.remove('auth-return-animation');
          authView.classList.remove('from-signout-layer');
          authView.classList.add('is-visible');
          appView.remove();
        } else if (authView) {
          authView.classList.remove('from-signout-layer');
          authView.classList.add('is-visible');
        }
      }
    } finally {
      state.busy = false;
    }
    return;
  }

  if (inviteToken) {
    await enterInvitePage(inviteToken);
    return;
  }

  if (location.hash && location.hash !== '#/') {
    setHash('#/');
    return;
  }

  const appView = document.getElementById('view-app');
  if (!appView || !appView.classList.contains('is-visible')) {
    await enterMainPage();
  } else {
    showTopPage('app');
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
  await route();
})();
