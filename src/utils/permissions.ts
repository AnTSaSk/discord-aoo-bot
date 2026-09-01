import { PermissionsBitField } from 'discord.js';

interface CanModifyObjectiveParams {
  userPermissions: PermissionsBitField | null;
  userId: string;
  objectiveOwnerId: string;
}

export const canModifyObjective = ({
  userPermissions,
  userId,
  objectiveOwnerId,
}: CanModifyObjectiveParams): boolean => {
  const isAdmin = userPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
  const canManageMessages = userPermissions?.has(PermissionsBitField.Flags.ManageMessages) ?? false;
  const isOwner = userId === objectiveOwnerId;

  return isAdmin || canManageMessages || isOwner;
};
