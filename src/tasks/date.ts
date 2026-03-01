import utc from 'dayjs/plugin/utc.js';
import dayjs, { type Dayjs } from 'dayjs';

import { RESET_HOUR } from '@/constants/albion.js';

dayjs.extend(utc);

const getHour = (date: Date): number => {
  const d = dayjs(date).utc();

  return d.hour();
};

export const getRelativeTime = (date: Date, time: string): Dayjs => {
  const d = dayjs(date).utc();
  const hours = time.substring(0, time.indexOf(':'));
  const minutes = time.substring(time.indexOf(':') + 1);

  let relativeTime = d.add(parseInt(hours), 'h');

  relativeTime = relativeTime.add(parseInt(minutes), 'm');

  return relativeTime;
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
