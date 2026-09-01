import utc from 'dayjs/plugin/utc.js';
import dayjs, { type Dayjs } from 'dayjs';

import { RESET_HOUR } from '@/constants/albion.js';
import { MAX_COMPOSED_MINUTES, MAX_TOTAL_MINUTES, MIN_TOTAL_MINUTES } from '@/constants/config.js';

dayjs.extend(utc);

const getHour = (date: Date): number => {
  const d = dayjs(date).utc();

  return d.hour();
};

export type TimeParseResult =
  { ok: true; minutes: number } | { ok: false; reason: 'format' | 'range' };

const HOUR_SEPARATOR_FORM = /^(\d+)[:.,;](\d{1,2})$/;
const COMPOSED_FORM = /^(\d+)h(?: ?(\d{1,2})m?)?$/;
const MINUTES_FORM = /^(\d+)m?$/;

const resolveMinutes = (totalMinutes: number): TimeParseResult => {
  if (totalMinutes < MIN_TOTAL_MINUTES || totalMinutes > MAX_TOTAL_MINUTES) {
    return { ok: false, reason: 'range' };
  }

  return { ok: true, minutes: totalMinutes };
};

export const parseTimeInput = (raw: string): TimeParseResult => {
  const normalized = raw.trim().toLowerCase();

  const separatorMatch = HOUR_SEPARATOR_FORM.exec(normalized);

  if (separatorMatch) {
    const hours = Number(separatorMatch[1]);
    const minutes = Number(separatorMatch[2]);

    return resolveMinutes(hours * 60 + minutes);
  }

  const composedMatch = COMPOSED_FORM.exec(normalized);

  if (composedMatch) {
    const hours = Number(composedMatch[1]);
    const minutes = composedMatch[2] ? Number(composedMatch[2]) : 0;

    if (minutes > MAX_COMPOSED_MINUTES) {
      return { ok: false, reason: 'format' };
    }

    return resolveMinutes(hours * 60 + minutes);
  }

  const minutesMatch = MINUTES_FORM.exec(normalized);

  if (minutesMatch) {
    return resolveMinutes(Number(minutesMatch[1]));
  }

  return { ok: false, reason: 'format' };
};

export const getRelativeTime = (date: Date, time: string): Dayjs => {
  const parsed = parseTimeInput(time);

  if (!parsed.ok) {
    throw new Error(`getRelativeTime: invalid time input "${time}"`);
  }

  const d = dayjs(date).utc();

  return d.add(parsed.minutes, 'm');
};

export const isMaintenanceAdded = (objectiveTime: Dayjs): boolean => {
  const currentDate = dayjs().utc();

  // Same date
  if (currentDate.isSame(objectiveTime, 'day')) {
    if (
      getHour(currentDate.toDate()) < RESET_HOUR &&
      getHour(objectiveTime.toDate()) > RESET_HOUR
    ) {
      return false;
    }
  } else {
    if (getHour(objectiveTime.toDate()) > RESET_HOUR) {
      return false;
    }
  }

  return true;
};
