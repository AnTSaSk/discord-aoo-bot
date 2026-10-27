import { describe, it, expect } from 'vitest';
import { DiscordAPIError, HTTPError } from 'discord.js';
import {
  BaseError,
  ConnectionError,
  DatabaseError,
  UniqueConstraintError,
  ValidationError,
  ValidationErrorItem,
} from '@sequelize/core';
import { pino } from 'pino';

import { errorSerializers, formatLoggedError } from '@/config/logSerializers.js';

const MEMBER_URL = 'https://discord.com/api/v10/guilds/guild-1/members/123456789012345678';
const REQUEST_BODY = { body: { content: 'secret text', user_id: '123456789012345678' } };
const INSERT_SQL = 'INSERT INTO "objectives" ("guildId","userId") VALUES ($1,$2);';
const INSERT_PARAMETERS = { $1: 'guild-1', $2: '123456789012345678' };

const missingAccessError = (): DiscordAPIError =>
  new DiscordAPIError(
    { code: 50001, message: 'Missing Access' },
    50001,
    403,
    'PATCH',
    MEMBER_URL,
    REQUEST_BODY,
  );

const postgresFailure = (code: unknown): Error & { sql: string; parameters: object; code: unknown } =>
  Object.assign(new Error('duplicate key value violates unique constraint'), {
    sql: INSERT_SQL,
    parameters: INSERT_PARAMETERS,
    code,
  });

describe('formatLoggedError — Discord API errors (logging AC-LOG-4)', () => {
  it('logging AC-LOG-4 writes only the code and the message of a DiscordAPIError', () => {
    expect(formatLoggedError(missingAccessError())).toStrictEqual({
      code: 50001,
      message: 'Missing Access',
    });
  });

  it('logging AC-LOG-4 keeps the discord.js fallback message when the response carries none', () => {
    const error = new DiscordAPIError({ code: 0, message: '' }, 0, 500, 'GET', MEMBER_URL, REQUEST_BODY);

    expect(formatLoggedError(error)).toStrictEqual({ code: 0, message: 'Unknown Error' });
  });

  it('logging AC-LOG-4 keeps the discord.js fallback message of an OAuth error without description', () => {
    const error = new DiscordAPIError(
      { error: 'invalid_grant' },
      'invalid_grant',
      400,
      'POST',
      MEMBER_URL,
      REQUEST_BODY,
    );

    expect(formatLoggedError(error)).toStrictEqual({ code: 'invalid_grant', message: 'No Description' });
  });
});

describe('formatLoggedError — @sequelize/core errors (logging AC-LOG-5)', () => {
  it('logging AC-LOG-5 writes name, message and the string code of the cause of a DatabaseError', () => {
    const error = new DatabaseError(postgresFailure('23505'));

    expect(formatLoggedError(error)).toStrictEqual({
      name: 'SequelizeDatabaseError',
      message: 'duplicate key value violates unique constraint',
      code: '23505',
    });
  });

  it('logging AC-LOG-5 writes name, message and the system code of the cause of a ConnectionError', () => {
    const error = new ConnectionError(
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }),
    );

    expect(formatLoggedError(error)).toStrictEqual({
      name: 'SequelizeConnectionError',
      message: 'connect ECONNREFUSED 127.0.0.1:5432',
      code: 'ECONNREFUSED',
    });
  });

  it('logging AC-LOG-5 writes only name and message of a Sequelize error without cause', () => {
    const error = new BaseError('Sequelize failure');

    expect(formatLoggedError(error)).toStrictEqual({ name: error.name, message: 'Sequelize failure' });
  });

  it('logging AC-LOG-5 writes only name and message when the cause carries no code', () => {
    const error = new DatabaseError(
      Object.assign(new Error('relation does not exist'), { sql: INSERT_SQL, parameters: INSERT_PARAMETERS }),
    );

    expect(formatLoggedError(error)).toStrictEqual({
      name: 'SequelizeDatabaseError',
      message: 'relation does not exist',
    });
  });

  it('logging AC-LOG-5 drops a cause code that is not a string', () => {
    const error = new DatabaseError(postgresFailure(23505));

    expect(formatLoggedError(error)).toStrictEqual({
      name: 'SequelizeDatabaseError',
      message: 'duplicate key value violates unique constraint',
    });
  });

  it('logging AC-LOG-5 writes a ValidationError without its validation items', () => {
    const item = new ValidationErrorItem(
      'Objective.userId cannot be null',
      'notNull violation',
      'userId',
      '123456789012345678',
    );
    const error = new ValidationError('notNull Violation: Objective.userId cannot be null', [item]);

    expect(formatLoggedError(error)).toStrictEqual({
      name: 'SequelizeValidationError',
      message: 'notNull Violation: Objective.userId cannot be null',
    });
  });

  it('logging AC-LOG-5 writes a UniqueConstraintError without fields, errors nor SQL', () => {
    const item = new ValidationErrorItem(
      'userId must be unique',
      'unique violation',
      'userId',
      '123456789012345678',
    );
    const error = new UniqueConstraintError({
      message: 'Validation error',
      fields: { userId: '123456789012345678' },
      errors: [item],
      cause: Object.assign(new Error('duplicate key value'), { sql: INSERT_SQL, code: '23505' }),
    });

    expect(formatLoggedError(error)).toStrictEqual({
      name: 'SequelizeUniqueConstraintError',
      message: 'Validation error',
      code: '23505',
    });
  });
});

describe('formatLoggedError — other errors (logging AC-LOG-6)', () => {
  it('logging AC-LOG-6 writes name, message and stack of a plain Error', () => {
    const error = new Error('boom');

    expect(formatLoggedError(error)).toStrictEqual({ name: 'Error', message: 'boom', stack: error.stack });
  });

  it('logging AC-LOG-6 writes name, message and stack of a TypeError', () => {
    const error = new TypeError('cannot read properties of undefined');

    expect(formatLoggedError(error)).toStrictEqual({
      name: 'TypeError',
      message: 'cannot read properties of undefined',
      stack: error.stack,
    });
  });

  it('logging AC-LOG-6 writes only name, message and stack of an HTTPError, without url nor request body', () => {
    const error = new HTTPError(502, 'Bad Gateway', 'GET', MEMBER_URL, REQUEST_BODY);

    expect(formatLoggedError(error)).toStrictEqual({
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  });

  it('logging AC-LOG-6 drops the extra enumerable properties of a network error', () => {
    const error = Object.assign(new Error('socket hang up'), {
      url: MEMBER_URL,
      requestBody: REQUEST_BODY,
    });

    expect(formatLoggedError(error)).toStrictEqual({
      name: 'Error',
      message: 'socket hang up',
      stack: error.stack,
    });
  });
});

describe('formatLoggedError — other errors carrying a code (logging AC-LOG-6)', () => {
  it('logging AC-LOG-6 writes only name, message and stack of an Error with its own string code', () => {
    const error = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });

    expect(formatLoggedError(error)).toStrictEqual({
      name: 'Error',
      message: 'read ECONNRESET',
      stack: error.stack,
    });
  });

  it('logging AC-LOG-6 writes only name, message and stack of an Error whose cause carries a string code', () => {
    const error = new Error('fetch failed', { cause: { code: 'ECONNREFUSED' } });

    expect(formatLoggedError(error)).toStrictEqual({
      name: 'Error',
      message: 'fetch failed',
      stack: error.stack,
    });
  });
});

describe('formatLoggedError — values that are not errors (logging AC-LOG-7)', () => {
  it('logging AC-LOG-7 writes a string as is', () => {
    expect(formatLoggedError('plain failure text')).toBe('plain failure text');
  });

  it('logging AC-LOG-7 writes a plain object as is', () => {
    const announcerError = { name: 'DiscordAPIError', message: 'Missing Access', code: 50001 };

    expect(formatLoggedError(announcerError)).toBe(announcerError);
  });

  it('logging AC-LOG-7 writes undefined as is', () => {
    expect(formatLoggedError(undefined)).toBeUndefined();
  });
});

describe('formatLoggedError — unreadable errors (logging AC-LOG-8)', () => {
  it('logging AC-LOG-8 writes [unformattable error] without throwing when reading the error throws', () => {
    const error = new Error('hidden');

    Object.defineProperty(error, 'message', {
      get: (): never => {
        throw new Error('unreadable');
      },
    });

    expect(formatLoggedError(error)).toBe('[unformattable error]');
  });

  it('logging AC-LOG-8 writes [unformattable error] without throwing when reading a DiscordAPIError throws', () => {
    const error = missingAccessError();

    Object.defineProperty(error, 'message', {
      get: (): never => {
        throw new Error('unreadable');
      },
    });

    expect(formatLoggedError(error)).toBe('[unformattable error]');
  });

  it('logging AC-LOG-8 writes [unformattable error] without throwing when reading a Sequelize error cause throws', () => {
    const error = new DatabaseError(postgresFailure('23505'));

    Object.defineProperty(error, 'cause', {
      get: (): never => {
        throw new Error('unreadable');
      },
    });

    expect(formatLoggedError(error)).toBe('[unformattable error]');
  });
});

describe('errorSerializers with a real pino logger (logging AC-LOG-9)', () => {
  const captureLogger = (): { logger: ReturnType<typeof pino>; lines: string[] } => {
    const lines: string[] = [];
    const destination = {
      write: (line: string): void => {
        lines.push(line);
      },
    };

    return { logger: pino({ serializers: errorSerializers, timestamp: false }, destination), lines };
  };

  const parsedLine = (lines: string[]): Record<string, unknown> => {
    expect(lines).toHaveLength(1);

    return JSON.parse(lines[0] ?? '') as Record<string, unknown>;
  };

  it('logging AC-LOG-9 exposes formatLoggedError as both the error and err serializers', () => {
    expect(errorSerializers).toStrictEqual({ error: formatLoggedError, err: formatLoggedError });
  });

  it('logging AC-LOG-9 formats an error placed under the error key', () => {
    const { logger, lines } = captureLogger();

    logger.error({ error: missingAccessError(), guildId: 'guild-1' }, 'Failed to resolve guild member');

    const line = parsedLine(lines);

    expect(line.error).toStrictEqual({ code: 50001, message: 'Missing Access' });
    expect(lines[0]).not.toContain(MEMBER_URL);
    expect(lines[0]).not.toContain('requestBody');
  });

  it('logging AC-LOG-9 formats an error passed as the first argument', () => {
    const { logger, lines } = captureLogger();

    logger.error(missingAccessError(), 'Discord call failed');

    const line = parsedLine(lines);

    expect(line.err).toStrictEqual({ code: 50001, message: 'Missing Access' });
    expect(lines[0]).not.toContain(MEMBER_URL);
    expect(lines[0]).not.toContain('requestBody');
  });
});
