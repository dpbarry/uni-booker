import { apiFetch, getUser } from './global.js';
import { createCalendar } from './calendar.js';
import { escapeHtml, formatClockTime, formatShortDate } from './format.js';

let calendar = null;
let calendarHost = null;
let currentView = 'month';

const renderList = (rows) => {
    const card = document.querySelector('.card-upcoming');
    if (!card) return;
    const list = card.querySelector('.upcoming-list');
    const empty = card.querySelector('[data-empty="upcoming"]');
    if (!rows.length) {
        list.hidden = true;
        list.innerHTML = '';
        empty.hidden = false;
        return;
    }
    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = rows.map((r) => `
        <li class="upcoming-row" data-booking-id="${r.booking_id}">
            <div class="upcoming-when">
                <span class="upcoming-day">${formatShortDate(r.date)}</span>
                <span class="upcoming-time">${formatClockTime(r.time)}</span>
            </div>
            <div class="upcoming-meta">
                <span class="upcoming-role">${r.role === 'owner' ? 'Your slot' : 'With'}</span>
                <span class="upcoming-counterparty">${escapeHtml(r.counterparty_email)}</span>
            </div>
            <button type="button" class="row-icon-button" data-action="cancel-upcoming" data-booking-id="${r.booking_id}" title="${r.role === 'owner' ? 'Delete slot' : 'Cancel booking'}">
                <svg width="14" height="14" viewBox="0 0 24 24"><use href="assets/icons.svg#x" /></svg>
            </button>
        </li>
    `).join('');
};

const toEvents = (rows) => rows.map((r) => ({
    date: r.date,
    id: r.booking_id,
    role: r.role,
    time: r.time,
}));

const highlightRow = (bookingId) => {
    const el = document.querySelector(`.upcoming-row[data-booking-id="${bookingId}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.animate(
        [{ background: 'var(--active-bg)' }, { background: 'var(--color-elevated)' }],
        { duration: 800, easing: 'ease-out' },
    );
};

const ensureCalendar = (el) => {
    if (!el) return calendar;
    if (calendar && calendarHost === el && document.body.contains(el)) return calendar;
    if (calendar) {
        calendar.destroy();
        calendar = null;
        calendarHost = null;
    }
    calendar = createCalendar(el, {
        mode: 'visualizer',
        view: currentView,
        onDayClick: (_date, events) => {
            if (events[0]) highlightRow(events[0].id);
        },
    });
    calendarHost = el;
    return calendar;
};

const setupExportButton = () => {
    const user = getUser();
    const exportButton = document.getElementById("export-cal-btn");
    if (!exportButton || !user) return;

    exportButton.href = `/api/export-calendar?user_id=${user.id}`;
};


export const setUpcomingView = (view) => {
    currentView = view === 'week' ? 'week' : 'month';
    calendar?.setView(currentView);
};

export const refreshUpcoming = async () => {
    const user = getUser();
    if (!user) return;
    let rows = [];
    try {
        rows = await apiFetch(`/upcoming/${user.id}`);
    } catch (err) {
        console.error('Failed to load upcoming:', err);
    }
    renderList(rows);
    calendar?.setEvents(toEvents(rows));

    const btn = document.getElementById("export-cal-btn");
    if (btn) btn.style.display = rows.length ? "" : "none";
};

export const mountUpcoming = async (view) => {
    const el = document.querySelector('.upcoming-calendar');
    if (!el) return;
    currentView = view === 'week' ? 'week' : 'month';
    ensureCalendar(el);
    calendar?.setView(currentView);
    setupExportButton();
    await refreshUpcoming();
};
