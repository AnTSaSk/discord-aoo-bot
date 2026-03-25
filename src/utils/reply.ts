import { MessageFlags } from 'discord.js';
import type { Command } from '@sapphire/framework';

const ERROR_MESSAGES = {
  missingValues: `Something went wrong, please try again.
If the problem persist, please contact the Bot Developer.`,
  invalidValues: `One or multiple value(s) are incorrect, please try again.
If the problem persist, please contact the Bot Developer.`,
  objectiveNotFound: 'We cannot find the objective you want to remove',
  permissionDenied: 'You don\'t have permission to remove this objective!',
  duplicateObjective: 'It appears that the objective you are trying to add already exists',
  noObjectives: 'No objectives to display',
  generic: 'Something went wrong, please try again.',
} as const;

export type ErrorType = keyof typeof ERROR_MESSAGES;

export const replyError = async (
  interaction: Command.ChatInputCommandInteraction,
  type: ErrorType,
): Promise<void> => {
  await interaction.reply({
    content: ERROR_MESSAGES[type],
    flags: MessageFlags.Ephemeral,
  });
};
