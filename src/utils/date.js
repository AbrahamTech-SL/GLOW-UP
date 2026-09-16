/**
 * GLOW UP — Centralized Date & Time Utilities
 *
 * All dates and times are strictly derived from the user's local browser/device clock.
 * NEVER uses toISOString().split('T')[0] for local date calculations, preventing UTC offset shifts.
 */

/**
 * Returns 'YYYY-MM-DD' representing the local calendar date of the given Date.
 * @param {Date|string|number} [d=new Date()]
 * @returns {string} e.g. "2026-09-16"
 */
export function getLocalDateString(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Safely parses a 'YYYY-MM-DD' string into a Date object set to local midnight.
 * Prevents JavaScript from interpreting 'YYYY-MM-DD' as UTC midnight.
 * @param {string} dateStr
 * @returns {Date}
 */
export function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return new Date();
  const parts = dateStr.split('-');
  if (parts.length !== 3) return new Date(dateStr);
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return new Date(year, month, day, 0, 0, 0, 0);
}

/**
 * Returns short weekday name ('Mon', 'Tue', etc.)
 * @param {Date|string} [d=new Date()]
 * @returns {string}
 */
export function getLocalWeekdayShort(d = new Date()) {
  return getLocalWeekdayName(d, 'short');
}

/**
 * Returns local weekday name ('Monday', 'Tuesday', etc.)
 * @param {Date|string} [d=new Date()]
 * @param {'long'|'short'|'narrow'} [format='long']
 * @returns {string}
 */
export function getLocalWeekdayName(d = new Date(), format = 'long') {
  const date = typeof d === 'string' ? parseLocalDate(d) : d;
  return date.toLocaleDateString(undefined, { weekday: format });
}

/**
 * Returns local month name ('January', 'September', etc.)
 * @param {Date|string} [d=new Date()]
 * @param {'long'|'short'} [format='long']
 * @returns {string}
 */
export function getLocalMonthName(d = new Date(), format = 'long') {
  const date = typeof d === 'string' ? parseLocalDate(d) : d;
  return date.toLocaleDateString(undefined, { month: format });
}

/**
 * Formats a date for screen headers e.g. "Wednesday, Sep 16"
 * @param {Date|string} [d=new Date()]
 * @returns {string}
 */
export function formatHeaderDate(d = new Date()) {
  const date = typeof d === 'string' ? parseLocalDate(d) : d;
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Formats a full display date e.g. "Wednesday, Sep 16, 2026"
 * @param {Date|string} [d=new Date()]
 * @returns {string}
 */
export function formatFullDate(d = new Date()) {
  const date = typeof d === 'string' ? parseLocalDate(d) : d;
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Formats local time e.g. "08:15 AM"
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
export function getLocalTimeFormatted(d = new Date()) {
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Checks if two dates represent the same calendar day.
 * @param {Date|string} d1
 * @param {Date|string} d2
 * @returns {boolean}
 */
export function isSameDay(d1, d2) {
  const str1 = typeof d1 === 'string' ? d1 : getLocalDateString(d1);
  const str2 = typeof d2 === 'string' ? d2 : getLocalDateString(d2);
  return str1 === str2;
}

/**
 * Checks if given date is today in the local timezone.
 * @param {Date|string} d
 * @returns {boolean}
 */
export function isToday(d) {
  return isSameDay(d, new Date());
}

/**
 * Returns start of day (00:00:00.000) in local timezone.
 * @param {Date|string} [d=new Date()]
 * @returns {Date}
 */
export function getStartOfDay(d = new Date()) {
  const date = typeof d === 'string' ? parseLocalDate(d) : new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Returns end of day (23:59:59.999) in local timezone.
 * @param {Date|string} [d=new Date()]
 * @returns {Date}
 */
export function getEndOfDay(d = new Date()) {
  const date = typeof d === 'string' ? parseLocalDate(d) : new Date(d);
  date.setHours(23, 59, 59, 999);
  return date;
}

/**
 * Returns 7 days for the current week (Monday through Sunday) around given date.
 * Standard ISO-like week (Monday = day 1, Sunday = day 7).
 * @param {Date|string} [refDate=new Date()]
 * @returns {{ weekStart: string, weekEnd: string, days: Array<any> } & Array<any>}
 */
export function getCurrentWeek(refDate = new Date()) {
  const target = typeof refDate === 'string' ? parseLocalDate(refDate) : new Date(refDate);
  const todayStr = getLocalDateString(new Date());

  const dayOfWeek = target.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(target);
  monday.setDate(target.getDate() + mondayOffset);

  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const shortNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const fullNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const dateStr = getLocalDateString(day);

    days.push({
      dateStr,
      dayLetter: letters[i],
      weekdayShort: shortNames[i],
      dayName: fullNames[i],
      dayNumber: day.getDate(),
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
      isFuture: dateStr > todayStr
    });
  }

  const weekObj = {
    weekStart: days[0].dateStr,
    weekEnd: days[6].dateStr,
    days,
    length: 7,
    [Symbol.iterator]: function* () {
      yield* days;
    }
  };

  days.forEach((d, idx) => {
    weekObj[idx] = d;
  });

  return weekObj;
}

/**
 * Generates a full month calendar grid (flattened array of day cells) for month view.
 * @param {number} year e.g. 2026
 * @param {number} month 0-indexed (0 = Jan, 8 = Sep)
 * @returns {Array<{ dateStr: string, dayNumber: number, isCurrentMonth: boolean, isToday: boolean }>}
 */
export function getMonthCalendarGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const todayStr = getLocalDateString(new Date());

  const startDayOfWeek = firstDay.getDay();
  const startOffset = startDayOfWeek === 0 ? -6 : 1 - startDayOfWeek;

  const current = new Date(year, month, 1 + startOffset);
  const cells = [];

  for (let i = 0; i < 42; i++) {
    const dateStr = getLocalDateString(current);
    cells.push({
      dateStr,
      dayNumber: current.getDate(),
      isCurrentMonth: current.getMonth() === month,
      isToday: dateStr === todayStr
    });
    current.setDate(current.getDate() + 1);

    if (current.getMonth() !== month && cells.length >= 28 && current.getDay() === 1) {
      break;
    }
  }

  return cells;
}
