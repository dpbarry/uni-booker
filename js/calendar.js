const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
};
const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
};
const startOfWeek = (d) => addDays(d, -d.getDay());
const sameDay = (a, b) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const clearNavHover = (root) => { // needed for some reason... otherwise glitches
    root.querySelectorAll('.cal-nav-btn.is-hovered').forEach((btn) => btn.classList.remove('is-hovered'));
};

 // VISUALIZER, PICKER, OR RANGE
export const createCalendar = (el, opts = {}) => {
    const state = {
        mode: opts.mode || 'visualizer',
        view: opts.view === 'week' ? 'week' : 'month',
        cursor: opts.initial ? parseYmd(opts.initial) : new Date(),
        events: new Map(),
        selected: opts.selected || null,
        range: opts.range || null,
        pendingStart: null,
    };
    const cb = {
        onSelect: opts.onSelect,
        onRangeChange: opts.onRangeChange,
        onDayClick: opts.onDayClick,
    };

    const setEvents = (list) => {
        state.events = new Map();
        for (const e of list || []) {
            if (!e?.date) continue;
            const arr = state.events.get(e.date) || [];
            arr.push(e);
            state.events.set(e.date, arr);
        }
        render();
    };

    const cellHtml = (d, today) => {
        const key = ymd(d);
        const inMonth = state.view === 'week' || d.getMonth() === state.cursor.getMonth();
        const classes = ['cal-cell'];
        if (!inMonth) classes.push('is-dim');
        if (sameDay(d, today)) classes.push('is-today');
        if (state.events.has(key)) classes.push('has-events');
        if (state.mode === 'picker' && state.selected === key) classes.push('is-selected');
        if (state.mode === 'range' && state.range) {
            if (key === state.range.start || key === state.range.end) classes.push('is-selected');
            else if (state.range.end && key > state.range.start && key < state.range.end) classes.push('is-range');
        }
        if (state.pendingStart === key) classes.push('is-selected');
        return `<button type="button" class="${classes.join(' ')}" data-date="${key}">
            <span class="cal-num">${d.getDate()}</span>
            <span class="cal-dot" aria-hidden="true"></span>
        </button>`;
    };

    const render = () => {
        const today = new Date();
        const title = state.view === 'month'
            ? `${MONTHS[state.cursor.getMonth()]} ${state.cursor.getFullYear()}`
            : (() => {
                const s = startOfWeek(state.cursor);
                const e = addDays(s, 6);
                return `${MONTHS[s.getMonth()].slice(0, 3)} ${s.getDate()} – ${MONTHS[e.getMonth()].slice(0, 3)} ${e.getDate()}`;
            })();

        let cells = '';
        if (state.view === 'month') {
            const first = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
            const start = startOfWeek(first);
            for (let i = 0; i < 42; i++) cells += cellHtml(addDays(start, i), today);
        } else {
            const start = startOfWeek(state.cursor);
            for (let i = 0; i < 7; i++) cells += cellHtml(addDays(start, i), today);
        }

        el.innerHTML = `
            <div class="cal-head">
                <div class="cal-title">${title}</div>
                <div class="cal-nav">
                    <button type="button" class="cal-nav-btn" data-nav="prev" title="Previous" aria-label="Previous">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <button type="button" class="cal-nav-btn" data-nav="next" title="Next" aria-label="Next">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                    </button>
                </div>
            </div>
            <div class="cal-dow">${DOW.map((d) => `<span>${d}</span>`).join('')}</div>
            <div class="cal-grid cal-grid-${state.view}">${cells}</div>
        `;
    };

    const shiftCursor = (dir) => {
        if (state.view === 'month') {
            state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + dir, 1);
        } else {
            state.cursor = addDays(state.cursor, dir * 7);
        }
    };

    el.classList.add('cal');
    el.classList.toggle('cal-mode-picker', state.mode === 'picker');
    el.classList.toggle('cal-mode-range', state.mode === 'range');
    el.classList.toggle('cal-mode-visualizer', state.mode === 'visualizer');
    el.addEventListener('pointermove', (e) => {
        const btn = e.target.closest('.cal-nav-btn');
        clearNavHover(el);
        if (btn && el.contains(btn)) btn.classList.add('is-hovered');
    });
    el.addEventListener('pointerleave', () => clearNavHover(el));
    el.addEventListener('click', (e) => {
        const nav = e.target.closest('[data-nav]');
        if (nav) {
            const d = nav.dataset.nav;
            if (d === 'prev') shiftCursor(-1);
            else if (d === 'next') shiftCursor(1);
            render();
            return;
        }
        const cell = e.target.closest('.cal-cell');
        if (!cell) return;
        const date = cell.dataset.date;

        if (state.mode === 'picker') {
            state.selected = date;
            render();
            cb.onSelect?.(date);
        } else if (state.mode === 'range') {
            if (!state.pendingStart) {
                state.pendingStart = date;
                state.range = null;
                render();
            } else {
                const [start, end] = date < state.pendingStart
                    ? [date, state.pendingStart]
                    : [state.pendingStart, date];
                state.range = { start, end };
                state.pendingStart = null;
                render();
                cb.onRangeChange?.(start, end);
            }
        } else {
            cb.onDayClick?.(date, state.events.get(date) || []);
        }
    });

    render();

    return {
        refresh: render,
        setEvents,
        setView: (v) => { state.view = v === 'week' ? 'week' : 'month'; render(); },
        setSelected: (s) => { state.selected = s; render(); },
        setRange: (r) => { state.range = r; state.pendingStart = null; render(); },
        goto: (dateStr) => { state.cursor = parseYmd(dateStr); render(); },
        destroy: () => {
            el.innerHTML = '';
            el.classList.remove('cal', 'cal-mode-picker', 'cal-mode-range', 'cal-mode-visualizer');
        },
    };
};
