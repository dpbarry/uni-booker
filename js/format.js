export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
}[char]));

export const initialFromEmail = (email, fallback = '?') => (email?.[0] || fallback).toUpperCase();

export const formatShortDate = (rawDate) => {
    if (!rawDate) return '';
    const [year, month, day] = String(rawDate).split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
};

export const formatClockTime = (rawTime) => {
    if (!rawTime) return '';
    const [hours, minutes] = String(rawTime).slice(0, 5).split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const pad2 = (n) => String(n).padStart(2, '0');
export const toYmd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const toHm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
