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
import './slots.js';

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

const onSignIn = async () => {
  const emailInput = document.getElementById('auth-email');
  const email = emailInput?.value.trim();

  if (!email) {
    alert('Enter your email');
    return;
  }

  try {
    const response = await fetch('http://localhost:3000/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || 'Login failed');
      return;
    }

    sessionStorage.setItem(authKey, '1');
    sessionStorage.setItem('user', JSON.stringify(data));

    state.animateNextMainEntry = true;
    location.replace('#/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    alert('Server error');
  }
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
      if (panelName === 'dashboard') {
        await initDashboardPanel();
      }
      if (panelName === 'calendar') {
        await window.loadCalendarSlots();
      }
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
      if (panelName === 'dashboard') {
        await initDashboardPanel();
      }
      if (panelName === 'calendar') {
        await window.loadCalendarSlots();
      }
    } catch (error) {
      if (animateEntry) progress.stop();
      if (previousPanel) setActiveNav(previousPanel);
      throw error;
    }
  });
}

const initDashboardPanel = async () => {
  const user = JSON.parse(sessionStorage.getItem('user'));

  if (!user) return;

  const welcome = document.getElementById('dashboard-welcome');
  const ownerDashboard = document.getElementById('owner-dashboard');
  const studentDashboard = document.getElementById('student-dashboard');

  if (welcome) {
    welcome.textContent = `Welcome, ${user.email}`;
  }

  if (user.role === 'owner') {
    if (ownerDashboard) ownerDashboard.style.display = 'block';
    setupCreateSlotForm();
    await loadOwnerSlots(user.id);
  } else {
    if (studentDashboard) studentDashboard.style.display = 'block';
  }
};

const loadOwnerSlots = async (ownerId) => {
  try {
    const response = await fetch(`http://localhost:3000/slots/owner/${ownerId}`);
    const slots = await response.json();

    const container = document.getElementById('owner-slots-container');
    if (!container) return;

    container.innerHTML = '';

    if (!slots.length) {
      container.innerHTML = '<p>No slots found.</p>';
      return;
    }

    slots.forEach((slot) => {
      const div = document.createElement('div');
      div.className = 'slot-card';
      div.innerHTML = `
        <p><strong>Date:</strong> ${slot.date.split('T')[0]}</p>
        <p><strong>Time:</strong> ${slot.time}</p>
        <p><strong>Active:</strong> ${slot.active ? 'Yes' : 'No'}</p>
        <button onclick="toggleSlot(${slot.id})">
          ${slot.active ? 'Deactivate' : 'Activate'}
        </button>
        <button onclick="deleteSlot(${slot.id})">
          Delete
        </button>
      `;
      container.appendChild(div);
    });
  } catch (error) {
    console.error('Error loading owner slots:', error);
  }
};

const setupCreateSlotForm = () => {
  const createBtn = document.getElementById('create-slot-btn');
  if (!createBtn) return;

  createBtn.onclick = async () => {
    const user = JSON.parse(sessionStorage.getItem('user'));
    const dateInput = document.getElementById('slot-date');
    const timeInput = document.getElementById('slot-time');

    const date = dateInput?.value;
    const time = timeInput?.value;

    if (!user || !date || !time) {
      alert('Please fill in date and time');
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/slots/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: user.id,
          date,
          time
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to create slot');
        return;
      }

      dateInput.value = '';
      timeInput.value = '';

      await loadOwnerSlots(user.id);
    } catch (error) {
      console.error('Error creating slot:', error);
      alert('Server error');
    }
  };
};

window.toggleSlot = async (slotId) => {
  try {
    await fetch(`http://localhost:3000/slots/${slotId}/toggle`, {
      method: 'PUT'
    });

    const user = JSON.parse(sessionStorage.getItem('user'));
    await loadOwnerSlots(user.id);
  } catch (err) {
    console.error('Error toggling slot:', err);
  }
};




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
