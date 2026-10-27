import { BaseError } from '@sequelize/core';
import { DiscordAPIError } from 'discord.js';

const UNFORMATTABLE_ERROR = '[unformattable error]';

const stringCodeOf = (cause: unknown): string | undefined =>
  typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string' ?
    cause.code :
    undefined;

const formatSequelizeError = (error: BaseError): Record<string, unknown> => {
  const code = stringCodeOf(error.cause);
  const formatted = { name: error.name, message: error.message };

  return code === undefined ? formatted : { ...formatted, code };
};

export const formatLoggedError = (value: unknown): unknown => {
  try {
    if (value instanceof DiscordAPIError) {
      return { code: value.code, message: value.message };
    }

    if (value instanceof BaseError) {
      return formatSequelizeError(value);
    }

    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }

    return value;
  } catch {
    return UNFORMATTABLE_ERROR;
  }
};

export const errorSerializers = { error: formatLoggedError, err: formatLoggedError };
