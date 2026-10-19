/**
 * Shared Date & Time Formatting Utilities for KaamMitra
 *
 * Implements strict format rules:
 * - Today's events: Today, 10:00 AM
 * - Yesterday's events: Yesterday, 10:00 AM
 * - Older events: 19 Oct 2026, 10:00 AM
 *
 * Accurately converts UTC timestamps to user's local timezone.
 * Handles midnight boundaries safely.
 */

export interface FormatTimestampOptions {
  lang?: 'hi' | 'en';
  /** If true, uses Hindi words "आज" / "कल" for local Hindi views when desired */
  useHindiWords?: boolean;
  /** Include 12-hour time part (default: true) */
  includeTime?: boolean;
}

const MONTH_NAMES_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Safely parses any date representation into a valid Date object or null
 */
export function parseValidDate(input?: string | number | Date | null): Date | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats time in user-local 12-hour format: "10:00 AM", "2:30 PM"
 */
export function formatLocalTime(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 hour is 12 AM
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours}:${minutesStr} ${ampm}`;
}

/**
 * Compares target date against now in user-local timezone.
 * Uses midnight timestamps to prevent midnight drift.
 */
export function getRelativeDayType(
  date: Date,
  now: Date = new Date()
): 'today' | 'yesterday' | 'other' {
  const targetYear = date.getFullYear();
  const targetMonth = date.getMonth();
  const targetDay = date.getDate();

  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowDay = now.getDate();

  if (targetYear === nowYear && targetMonth === nowMonth && targetDay === nowDay) {
    return 'today';
  }

  const yesterday = new Date(nowYear, nowMonth, nowDay - 1);
  if (
    targetYear === yesterday.getFullYear() &&
    targetMonth === yesterday.getMonth() &&
    targetDay === yesterday.getDate()
  ) {
    return 'yesterday';
  }

  return 'other';
}

/**
 * Standard App Timestamp Formatter:
 * - Today's events: Today, 10:00 AM
 * - Yesterday's events: Yesterday, 10:00 AM
 * - Older events: 19 Oct 2026, 10:00 AM
 */
export function formatAppTimestamp(
  input?: string | number | Date | null,
  options?: FormatTimestampOptions
): string {
  const date = parseValidDate(input);
  if (!date) return '';

  const useHindi = Boolean(options?.useHindiWords);
  const includeTime = options?.includeTime !== false;
  const now = new Date();

  const relType = getRelativeDayType(date, now);
  const timeStr = includeTime ? formatLocalTime(date) : '';

  if (relType === 'today') {
    const label = useHindi ? 'आज' : 'Today';
    return includeTime ? `${label}, ${timeStr}` : label;
  }

  if (relType === 'yesterday') {
    const label = useHindi ? 'कल' : 'Yesterday';
    return includeTime ? `${label}, ${timeStr}` : label;
  }

  // Older events: e.g. "19 Oct 2026, 10:00 AM"
  const day = date.getDate();
  const month = MONTH_NAMES_EN[date.getMonth()];
  const year = date.getFullYear();
  const dateStr = `${day} ${month} ${year}`;

  return includeTime ? `${dateStr}, ${timeStr}` : dateStr;
}

/**
 * Chat separator date header:
 * - "Today"
 * - "Yesterday"
 * - "19 Oct 2026"
 */
export function formatChatDateHeader(
  input?: string | number | Date | null,
  options?: FormatTimestampOptions
): string {
  return formatAppTimestamp(input, { ...options, includeTime: false });
}
