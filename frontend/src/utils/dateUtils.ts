/**
 * SuperWash Exprez — Indian Standard Time (IST) Date Utilities
 * Timezone: Asia/Kolkata (UTC+05:30)
 *
 * Prevents UTC day-boundary drift where `new Date().toISOString().split('T')[0]`
 * would evaluate to yesterday's date between 00:00 AM and 05:29 AM IST.
 */

const istDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const istLabelFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short'
});

/**
 * Returns the calendar date in Indian Standard Time (Asia/Kolkata) formatted as `YYYY-MM-DD`.
 *
 * @param baseDate Optional Date object; defaults to `new Date()`.
 * @returns ISO-style calendar date string in IST (e.g. "2026-11-05").
 */
export function getTodayDateIST(baseDate: Date = new Date()): string {
  const parts = istDateFormatter.formatToParts(baseDate);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Returns an offset calendar date in Indian Standard Time (Asia/Kolkata) formatted as `YYYY-MM-DD`.
 *
 * @param offsetDays Number of calendar days to offset (0 for today, 1 for tomorrow, 2 for +2 days).
 * @param baseDate Optional base Date; defaults to `new Date()`.
 * @returns ISO-style calendar date string in IST.
 */
export function getOffsetDateIST(offsetDays: number, baseDate: Date = new Date()): string {
  const d = new Date(baseDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  return getTodayDateIST(d);
}

/**
 * Formats a user-friendly date label for pickup date selectors according to IST.
 *
 * @param offsetDays Number of calendar days from baseDate.
 * @param baseDate Optional base Date; defaults to `new Date()`.
 * @returns e.g. "Today", "Tomorrow", or "Sat, 7 Nov".
 */
export function getDateOptionLabelIST(offsetDays: number, baseDate: Date = new Date()): string {
  if (offsetDays === 0) return 'Today';
  if (offsetDays === 1) return 'Tomorrow';
  const d = new Date(baseDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  return istLabelFormatter.format(d);
}

/**
 * Checks whether a given `YYYY-MM-DD` date string is in the past relative to today's IST calendar date.
 *
 * @param dateStr Date string in `YYYY-MM-DD` format.
 * @param baseDate Optional reference Date; defaults to `new Date()`.
 */
export function isPastDateIST(dateStr: string, baseDate: Date = new Date()): boolean {
  if (!dateStr) return false;
  const todayIST = getTodayDateIST(baseDate);
  return dateStr < todayIST;
}
