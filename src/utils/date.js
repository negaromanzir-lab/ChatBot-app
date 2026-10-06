/**
 * Date formatting for the conversation history.
 *
 * Everything here works off the browser's local time and degrades to empty
 * strings rather than throwing on a missing or unparseable date, because stored
 * conversations can predate any given field.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function startOfDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Bucket label for grouping conversations in the sidebar: 'Today',
 * 'Yesterday', 'Previous 7 days', or 'Older'.
 *
 * @param {number} timestamp
 * @param {number} [now] Injectable clock, so this is testable.
 */
export function formatRelativeDay(timestamp, now = Date.now()) {
  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
    return '';
  }

  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / DAY);

  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Previous 7 days';
  return 'Older';
}

const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

/** Absolute short date, used in tooltips where precision matters. */
export function formatAbsoluteDate(timestamp) {
  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
    return '';
  }
  return SHORT_DATE.format(new Date(timestamp));
}

/** Clock time, e.g. '14:32'. */
export function formatTime(timestamp) {
  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
    return '';
  }
  return TIME.format(new Date(timestamp));
}

/** Terse relative age for sidebar rows, e.g. 'now', '4m', '3h', '2d'. */
export function formatRelativeTime(timestamp, now = Date.now()) {
  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
    return '';
  }

  const elapsed = now - timestamp;

  if (elapsed < MINUTE) return 'now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;

  return formatAbsoluteDate(timestamp);
}