import { describe, it, expect } from 'vitest';
import { PermissionsBitField } from 'discord.js';

import { canModifyObjective } from '@/utils/permissions.js';

const AUTHOR_ID = 'user-author';
const OTHER_ID = 'user-other';

const buildPermissions = (flags: bigint[]): PermissionsBitField => new PermissionsBitField(flags);

describe('canModifyObjective', () => {
  it('allows a server administrator (AC-1)', () => {
    const permissions = buildPermissions([PermissionsBitField.Flags.Administrator]);

    const result = canModifyObjective({
      userPermissions: permissions,
      userId: OTHER_ID,
      objectiveOwnerId: AUTHOR_ID,
    });

    expect(result).toBe(true);
  });

  it('allows a member with manage-messages (AC-1)', () => {
    const permissions = buildPermissions([PermissionsBitField.Flags.ManageMessages]);

    const result = canModifyObjective({
      userPermissions: permissions,
      userId: OTHER_ID,
      objectiveOwnerId: AUTHOR_ID,
    });

    expect(result).toBe(true);
  });

  it('allows the objective author (AC-1)', () => {
    const permissions = buildPermissions([]);

    const result = canModifyObjective({
      userPermissions: permissions,
      userId: AUTHOR_ID,
      objectiveOwnerId: AUTHOR_ID,
    });

    expect(result).toBe(true);
  });

  it('refuses a plain member who is not the author (AC-2)', () => {
    const permissions = buildPermissions([]);

    const result = canModifyObjective({
      userPermissions: permissions,
      userId: OTHER_ID,
      objectiveOwnerId: AUTHOR_ID,
    });

    expect(result).toBe(false);
  });

  it('refuses rather than throws when channel permissions are unreadable (null, AC-2)', () => {
    const result = canModifyObjective({
      userPermissions: null,
      userId: OTHER_ID,
      objectiveOwnerId: AUTHOR_ID,
    });

    expect(result).toBe(false);
  });
});
