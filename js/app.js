// Dean Barry, Mariana Diaz Betancourt
 
import {
    APP_TITLE,
    authKey,
    entryMs,
    getAllUsers,
    initTheme,
    pendingInviteKey,
    pendingPollKey, //
    signOutAnimateKey,
    userKey,
    usersKey,
} from './global.js';
import { ensureAuthPage } from './auth.js';
import { ensureMainPage, getAppView } from './main.js';
import { openBookingDialog } from './invite-booking.js';
import { openPollPage } from './group-poll.js';
import { openResetPage } from './reset-password.js';
 
const pageContainer = document.getElementById('page-container');
 
const applyDemoAccounts = () => {
    if (getAllUsers().length > 0) return;
    const demo = [
        { id: 1, email: 'prof@mcgill.ca', role: 'owner' },
        { id: 2, email: 'student@mail.mcgill.ca', role: 'student' },
    ];
    sessionStorage.setItem(usersKey, JSON.stringify(demo));
    sessionStorage.setItem(userKey, JSON.stringify(demo[0]));
    sessionStorage.setItem(authKey, '1');
};
 
const state = {
  busy: false,
  animateNextEntry: false,
};
 
const isAuthed = () => sessionStorage.getItem(authKey) === '1';
 
const onSignIn = () => {
  state.animateNextEntry = true;
  const pendingPoll = sessionStorage.getItem(pendingPollKey);
  if (pendingPoll) {
    sessionStorage.removeItem(pendingPollKey);
    location.replace(`#/poll/${pendingPoll}`);
    return;
  }
  const pending = sessionStorage.getItem(pendingInviteKey);
  if (pending) {
    sessionStorage.removeItem(pendingInviteKey);
    location.replace(`#/invite/${pending}`);
    return;
  }
  location.replace('#/');
};
 
const showTopPage = (which) => {
  document.getElementById('view-app')?.toggleAttribute('hidden', which !== 'app');
  document.getElementById('view-invite')?.toggleAttribute('hidden', which !== 'invite');
  document.getElementById('view-poll')?.toggleAttribute('hidden', which !== 'poll');
  document.getElementById('view-reset')?.toggleAttribute('hidden', which !== 'reset');
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
 
async function enterPollPage(token) {
  state.busy = true;
  state.animateNextEntry = false;
  try {
    await ensureMainPage(pageContainer);
    showTopPage('poll');
    const pollView = document.getElementById('view-poll');
    if (pollView) pollView.classList.add('is-visible');
    document.documentElement.classList.remove('first-paint-main');
    document.getElementById('view-auth')?.remove();
    await openPollPage(token);
  } finally {
    state.busy = false;
  }
}

 
async function enterResetPage(token) {
  state.busy = true;
  state.animateNextEntry = false;
  try {
    await ensureMainPage(pageContainer);
    showTopPage('reset');
    const resetView = document.getElementById('view-reset');
    if (resetView) resetView.classList.add('is-visible');
    document.documentElement.classList.remove('first-paint-main');
    document.getElementById('view-auth')?.remove();
    await openResetPage(token);
  } finally {
    state.busy = false;
  }
}
 
const route = async () => {
  document.title = APP_TITLE;
  if (state.busy) return;
 
  const inviteMatch = /^#\/invite\/(.+)$/.exec(location.hash);
  const inviteToken = inviteMatch ? decodeURIComponent(inviteMatch[1]) : null;
 
  const pollMatch = /^#\/poll\/(.+)$/.exec(location.hash);
  const pollToken = pollMatch ? decodeURIComponent(pollMatch[1]) : null;
 
  const resetMatch = /^#\/reset\/(.+)$/.exec(location.hash);
  const resetToken = resetMatch ? decodeURIComponent(resetMatch[1]) : null;
 
  if (!isAuthed()) {
    if (inviteToken) {
      sessionStorage.setItem(pendingInviteKey, inviteToken);
      location.replace('#/signin');
      return;
    }
    if (pollToken) {
      sessionStorage.setItem(pendingPollKey, pollToken);
      location.replace('#/signin');
      return;
    }
    if (resetToken) {
      await enterResetPage(resetToken);
      return;
    }
    if (location.hash !== '#/signin') {
      location.replace('#/signin');
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
 
  if (pollToken) {
    await enterPollPage(pollToken);
    return;
  }
 
  if (resetToken) {
    await enterResetPage(resetToken);
    return;
  }
 
  if (location.hash && location.hash !== '#/') {
    location.replace('#/');
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
  applyDemoAccounts();
  try {
    if (isAuthed()) await ensureMainPage(pageContainer);
    else await ensureAuthPage(pageContainer, onSignIn);
  } catch (error) {
    failHard(error);
    return;
  }
  await route();
})();
