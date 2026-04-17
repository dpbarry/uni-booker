const ANIM_MS = 200;

let stackEl = null;

const ensureStack = () => {
    if (stackEl && document.body.contains(stackEl)) return stackEl;
    stackEl = document.createElement('div');
    stackEl.className = 'toast-stack';
    stackEl.setAttribute('popover', 'manual');
    document.body.appendChild(stackEl);
    try { stackEl.showPopover(); } catch { }
    return stackEl;
};

export const showToast = ({
    content = '',
    dismissable = false,
    timeout = 2200,
    variant = 'default', } = {}) => {
    const stack = ensureStack();

    const toast = document.createElement('div');
    toast.className = `toast toast-${variant}`;
    if (dismissable) toast.classList.add('is-dismissable');

    const body = document.createElement('div');
    body.className = 'toast-body';
    if (content instanceof Node) body.appendChild(content);
    else body.innerHTML = String(content);
    toast.appendChild(body);

    let timer = null;
    let closed = false;
    const dismiss = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        toast.classList.remove('is-visible');
        toast.classList.add('is-leaving');
        setTimeout(() => toast.remove(), ANIM_MS);
    };

    if (dismissable) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-dismiss';
        btn.setAttribute('aria-label', 'Dismiss');
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><use href="assets/icons.svg#x" /></svg>`;
        btn.addEventListener('click', dismiss);
        toast.appendChild(btn);
    }

    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));

    if (timeout > 0) timer = setTimeout(dismiss, timeout);

    return { dismiss };
};
