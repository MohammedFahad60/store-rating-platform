/**
 * Operating-hours helpers shared by store settings, booking validation and
 * availability responses.
 *
 * Times are handled as 24h "HH:MM" strings (the TIME column may arrive as
 * "HH:MM:SS" from the driver). dayOfWeek: 1 = Monday ... 7 = Sunday.
 */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeTime(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return null;
  const h = String(Number(match[1])).padStart(2, "0");
  return `${h}:${match[2]}`;
}

function toMinutes(time) {
  const normalized = normalizeTime(time);
  if (!normalized) return null;
  const [h, m] = normalized.split(":").map(Number);
  return h * 60 + m;
}

/** 1 = Monday ... 7 = Sunday for a JS Date. */
function dayOfWeekForDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return ((d.getDay() + 6) % 7) + 1;
}

/**
 * Validate exactly 7 weekday entries (1..7). When a day is open, both
 * openTime and closeTime are required and closeTime must be strictly after
 * openTime. Returns { errors, entries }.
 */
function validateWeekdayHours(entries) {
  const errors = [];
  const byDay = new Map();

  if (!Array.isArray(entries)) {
    return { errors: ["Operating hours must be an array of 7 entries"], byDay };
  }

  for (const entry of entries) {
    const day = Number(entry?.dayOfWeek);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      errors.push("dayOfWeek must be an integer from 1 (Monday) to 7 (Sunday)");
      continue;
    }
    if (byDay.has(day)) {
      errors.push(`Duplicate hours for day ${day}`);
      continue;
    }

    const closed = Boolean(entry.closed);
    const openTime = normalizeTime(entry.openTime);
    const closeTime = normalizeTime(entry.closeTime);

    if (!closed) {
      if (!openTime || !closeTime) {
        errors.push(`Day ${day}: openTime and closeTime are required when the store is open`);
        continue;
      }
      if (!TIME_RE.test(openTime) || !TIME_RE.test(closeTime)) {
        errors.push(`Day ${day}: invalid time format (use HH:MM)`);
        continue;
      }
      if (toMinutes(closeTime) <= toMinutes(openTime)) {
        errors.push(`Day ${day}: closing time must be after opening time`);
        continue;
      }
    }

    byDay.set(day, { dayOfWeek: day, openTime: closed ? null : openTime, closeTime: closed ? null : closeTime, closed });
  }

  if (byDay.size !== 7 && errors.length === 0) {
    errors.push("Exactly 7 weekday entries are required (Monday to Sunday)");
  }

  return { errors, byDay };
}

/**
 * Build a dayOfWeek -> { openTime, closeTime, closed } map for a store.
 * StoreHours rows win; stores without rows fall back to the legacy
 * Stores.openingTime/closingTime default (open every day).
 */
function hoursMap(store, hourRows) {
  const map = {};
  if (Array.isArray(hourRows) && hourRows.length > 0) {
    for (const row of hourRows) {
      map[Number(row.dayOfWeek)] = {
        dayOfWeek: Number(row.dayOfWeek),
        openTime: normalizeTime(row.openTime),
        closeTime: normalizeTime(row.closeTime),
        closed: Boolean(row.closed),
      };
    }
    return map;
  }

  const open = normalizeTime(store?.openingTime) || "09:00";
  const close = normalizeTime(store?.closingTime) || "21:00";
  for (let day = 1; day <= 7; day += 1) {
    map[day] = { dayOfWeek: day, openTime: open, closeTime: close, closed: false };
  }
  return map;
}

/** Window for one date: { dayOfWeek, closed, open, close } (HH:MM). */
function windowForDate(map, dateStr) {
  const dayOfWeek = dayOfWeekForDate(dateStr);
  if (!dayOfWeek || !map) return { dayOfWeek, closed: true, open: null, close: null };
  const entry = map[dayOfWeek];
  if (!entry || entry.closed) return { dayOfWeek, closed: true, open: null, close: null };
  return { dayOfWeek, closed: false, open: normalizeTime(entry.openTime), close: normalizeTime(entry.closeTime) };
}

/** Is a booking at date+time inside this store's hours? */
function isOpenAt(map, dateStr, timeStr) {
  const window = windowForDate(map, dateStr);
  if (window.closed) return false;
  const minutes = toMinutes(timeStr);
  if (minutes === null) return false;
  return minutes >= toMinutes(window.open) && minutes < toMinutes(window.close);
}

/** Generate 30-minute slots between open and close, marking booked ones. */
function buildSlots(map, dateStr, bookedTimes = []) {
  const window = windowForDate(map, dateStr);
  if (window.closed) return { window, slots: [] };
  const start = toMinutes(window.open);
  const end = toMinutes(window.close);
  const booked = new Set(bookedTimes.map((t) => normalizeTime(t)).filter(Boolean));
  const slots = [];
  for (let m = start; m < end; m += 30) {
    const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    slots.push({ time, available: !booked.has(time) });
  }
  return { window, slots };
}

module.exports = {
  TIME_RE,
  normalizeTime,
  toMinutes,
  dayOfWeekForDate,
  validateWeekdayHours,
  hoursMap,
  windowForDate,
  isOpenAt,
  buildSlots,
};
