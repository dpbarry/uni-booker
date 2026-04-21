import { formatClockTime } from './format.js';

const pad2 = (n) => String(n).padStart(2, '0');

const hmToParts = (hm) => {
    const [hRaw, mRaw] = String(hm || '').split(':').map(Number);
    const h = Number.isFinite(hRaw) ? hRaw : 14;
    const minute = Number.isFinite(mRaw) ? mRaw : 0;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return { hour12: pad2(hour12), minute: pad2(minute), ampm };
};

const partsToHm = (hour12, minute, ampm) => {
    const h12 = Number(hour12);
    const mm = Number(minute);
    if (!Number.isFinite(h12) || !Number.isFinite(mm)) return '';
    let hour24 = h12 % 12;
    if (String(ampm).toUpperCase() === 'PM') hour24 += 12;
    return `${pad2(hour24)}:${pad2(mm)}`;
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export const createTimePicker = (host, opts = {}) => {
    if (!host) return null;
    const state = {
        value: opts.value || '14:00',
        open: false,
    };
    const cb = {
        onChange: opts.onChange,
    };

    host.classList.add('tp');
    host.innerHTML = `
        <button type="button" class="tp-trigger" aria-haspopup="dialog" aria-expanded="false">
            <span class="tp-trigger-value"></span>
            <svg class="tp-trigger-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <use href="assets/icons.svg#clock" />
            </svg>
        </button>
        <div class="tp-bubble" hidden>
            <div class="tp-row">
                <label class="tp-segment">
                    <div class="tp-spin-wrap">
                        <input type="text" inputmode="numeric" maxlength="2" class="tp-input" data-part="hour" aria-label="Hour">
                        <div class="tp-spin">
                            <button type="button" class="tp-spin-btn" data-spin="hour-up" aria-label="Increase hour">
                                <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" class="tp-spin-btn" data-spin="hour-down" aria-label="Decrease hour">
                                <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                        </div>
                    </div>
                </label>
                <span class="tp-colon" aria-hidden="true">:</span>
                <label class="tp-segment">
                    <div class="tp-spin-wrap">
                        <input type="text" inputmode="numeric" maxlength="2" class="tp-input" data-part="minute" aria-label="Minute">
                        <div class="tp-spin">
                            <button type="button" class="tp-spin-btn" data-spin="minute-up" aria-label="Increase minute by five">
                                <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button type="button" class="tp-spin-btn" data-spin="minute-down" aria-label="Decrease minute by five">
                                <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                        </div>
                    </div>
                </label>
                <label class="tp-segment tp-segment-meridiem">
                    <button type="button" class="tp-meridiem" data-part="ampm" aria-label="Toggle AM PM"></button>
                </label>
            </div>
        </div>
    `;

    const trigger = host.querySelector('.tp-trigger');
    const triggerValue = host.querySelector('.tp-trigger-value');
    const bubble = host.querySelector('.tp-bubble');
    const hourInput = host.querySelector('[data-part="hour"]');
    const minuteInput = host.querySelector('[data-part="minute"]');
    const ampmBtn = host.querySelector('[data-part="ampm"]');

    const normalizeInputs = () => {
        const hourNum = clamp(parseInt(hourInput.value || '12', 10) || 12, 1, 12);
        const minuteNum = clamp(parseInt(minuteInput.value || '0', 10) || 0, 0, 59);
        const ampm = ampmBtn.textContent === 'PM' ? 'PM' : 'AM';
        hourInput.value = pad2(hourNum);
        minuteInput.value = pad2(minuteNum);
        ampmBtn.textContent = ampm;
    };

    const commit = (emit = true) => {
        normalizeInputs();
        const next = partsToHm(hourInput.value, minuteInput.value, ampmBtn.textContent);
        if (!next) return;
        state.value = next;
        triggerValue.textContent = formatClockTime(next);
        if (emit) cb.onChange?.(next);
    };

    const applyStateToInputs = () => {
        const p = hmToParts(state.value);
        hourInput.value = p.hour12;
        minuteInput.value = p.minute;
        ampmBtn.textContent = p.ampm;
        triggerValue.textContent = formatClockTime(state.value);
    };

    const open = () => {
        if (state.open) return;
        state.open = true;
        bubble.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        hourInput.focus();
        hourInput.select();
    };

    const close = () => {
        if (!state.open) return;
        state.open = false;
        bubble.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
    };

    const toggleMeridiem = () => {
        ampmBtn.textContent = ampmBtn.textContent === 'AM' ? 'PM' : 'AM';
        commit();
    };

    const bumpHour = (delta) => {
        const current = clamp(parseInt(hourInput.value || '12', 10) || 12, 1, 12);
        const next = ((current - 1 + delta + 12) % 12) + 1;
        hourInput.value = pad2(next);
        commit();
    };

    const bumpMinute = (delta) => {
        const current = clamp(parseInt(minuteInput.value || '0', 10) || 0, 0, 59);
        const next = (current + delta + 60) % 60;
        minuteInput.value = pad2(next);
        commit();
    };

    const onDocPointerDown = (e) => {
        if (!state.open) return;
        if (!host.contains(e.target)) close();
    };

    const onDocKeyDown = (e) => {
        if (!state.open) return;
        if (e.key === 'Escape') {
            close();
            trigger.focus();
        }
    };

    const onDigitInput = (input, nextFocus) => {
        input.value = input.value.replace(/\D/g, '').slice(0, 2);
        if (input.value.length === 2 && nextFocus) {
            commit();
            nextFocus.focus();
            if (nextFocus.select) nextFocus.select();
        }
    };

    trigger.addEventListener('click', () => (state.open ? close() : open()));
    trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
        }
    });

    hourInput.addEventListener('focus', () => hourInput.select());
    minuteInput.addEventListener('focus', () => minuteInput.select());
    hourInput.addEventListener('input', () => onDigitInput(hourInput, minuteInput));
    minuteInput.addEventListener('input', () => onDigitInput(minuteInput, ampmBtn));
    hourInput.addEventListener('blur', () => commit(false));
    minuteInput.addEventListener('blur', () => commit(false));

    hourInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            bumpHour(1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            bumpHour(-1);
        }
    });

    minuteInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            bumpMinute(5);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            bumpMinute(-5);
        }
    });

    ampmBtn.addEventListener('click', toggleMeridiem);
    ampmBtn.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (k === 'a') {
            e.preventDefault();
            ampmBtn.textContent = 'AM';
            commit();
        } else if (k === 'p') {
            e.preventDefault();
            ampmBtn.textContent = 'PM';
            commit();
        } else if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            toggleMeridiem();
        }
    });

    host.querySelectorAll('[data-spin]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.spin;
            if (action === 'hour-up') bumpHour(1);
            if (action === 'hour-down') bumpHour(-1);
            if (action === 'minute-up') bumpMinute(5);
            if (action === 'minute-down') bumpMinute(-5);
        });
    });

    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onDocKeyDown);

    applyStateToInputs();

    return {
        getValue: () => state.value,
        setValue: (hm, { silent = false } = {}) => {
            state.value = hm;
            applyStateToInputs();
            if (!silent) cb.onChange?.(state.value);
        },
        destroy: () => {
            document.removeEventListener('pointerdown', onDocPointerDown);
            document.removeEventListener('keydown', onDocKeyDown);
            host.innerHTML = '';
            host.classList.remove('tp');
        },
    };
};
