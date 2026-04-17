const CLOSE_ANIMATION_MS = 180;
const DIALOG_CLOSE_CLASS = 'close';
const dialogs = new WeakMap();

export const registerDialog = (dialogEl, removeOnClose = false) => {
    if (!dialogEl || dialogs.has(dialogEl)) return dialogEl || null;

    const dialogInfo = {
        removeOnClose,
        isClosing: false,
        finishCloseTimer: null,
    };

    dialogEl.addEventListener('click', (e) => {
        if (e.target === dialogEl) {
            requestDialogClose(dialogEl);
        }
    });

    dialogEl.addEventListener('close', () => {
        dialogInfo.isClosing = false;
        if (dialogInfo.finishCloseTimer) {
            clearTimeout(dialogInfo.finishCloseTimer);
            dialogInfo.finishCloseTimer = null;
        }
        dialogEl.classList.remove(DIALOG_CLOSE_CLASS);
        if (dialogInfo.removeOnClose) {
            dialogs.delete(dialogEl);
            dialogEl.remove();
        }
    });

    dialogs.set(dialogEl, dialogInfo);
    return dialogEl;
};

export const openDialog = (dialogEl) => {
    if (!dialogEl) return null;
    registerDialog(dialogEl);
    const dialogInfo = dialogs.get(dialogEl);
    if (!dialogInfo) return dialogEl;

    dialogInfo.isClosing = false;
    dialogEl.classList.remove(DIALOG_CLOSE_CLASS);

    if (!dialogEl.open) dialogEl.showModal();
    return dialogEl;
};

export const requestDialogClose = (dialogEl) => {
    if (!dialogEl) return;
    const dialogInfo = dialogs.get(dialogEl);
    if (!dialogInfo || !dialogEl.open || dialogInfo.isClosing) return;

    dialogInfo.isClosing = true;
    dialogEl.classList.add(DIALOG_CLOSE_CLASS);

    if (dialogInfo.finishCloseTimer) {
        clearTimeout(dialogInfo.finishCloseTimer);
        dialogInfo.finishCloseTimer = null;
    }
    dialogInfo.finishCloseTimer = setTimeout(() => {
        dialogInfo.finishCloseTimer = null;
        if (dialogEl.open) dialogEl.close();
    }, CLOSE_ANIMATION_MS);
};

export const createDialog = ({ className = '', content = '' } = {}) => {
    const dialogEl = document.createElement('dialog');
    dialogEl.className = ['ui-dialog', className].filter(Boolean).join(' ');
    if (content instanceof Node) dialogEl.appendChild(content);
    else dialogEl.innerHTML = String(content);
    document.body.appendChild(dialogEl);
    registerDialog(dialogEl, true);
    return dialogEl;
};
