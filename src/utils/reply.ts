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
  invalidTimeFormat:
    'Invalid time format. Accepted formats: 1:30, 02:30, 1h30, 1h30m, 1h 30, 1h 30m, 1h, 90, 45m, 90m',
  timeOutOfRange: 'The provided time is out of the accepted range',
  invalidTypeRarity: 'This rarity is not valid for the selected type',
  missingRarity: 'This type requires a rarity, please provide one',
  unexpectedRarity: 'Dragon attacks have no rarity — select n/a instead',
  unexpectedRoyalMap: 'This map is in the Royal continent, which only Dragon attacks can use',
  guildOnly: 'This command can only be used inside a server',
} as const;

const PARAMETERIZED_ERROR_MESSAGES = {
  channelNotWritable: ({ permission }: ErrorParams): string =>
    `I cannot post in that channel: the **${permission}** permission is missing. Grant it there, then run the command again.`,
} as const;

export interface ErrorParams {
  permission: string;
}

export type StaticErrorType = keyof typeof ERROR_MESSAGES;
export type ParameterizedErrorType = keyof typeof PARAMETERIZED_ERROR_MESSAGES;
export type ErrorType = StaticErrorType | ParameterizedErrorType;

const isParameterized = (type: ErrorType): type is ParameterizedErrorType =>
  type in PARAMETERIZED_ERROR_MESSAGES;

export async function replyError(
  interaction: Command.ChatInputCommandInteraction,
  type: StaticErrorType,
): Promise<void>;
export async function replyError(
  interaction: Command.ChatInputCommandInteraction,
  type: ParameterizedErrorType,
  params: ErrorParams,
): Promise<void>;
export async function replyError(
  interaction: Command.ChatInputCommandInteraction,
  type: ErrorType,
  params?: ErrorParams,
): Promise<void> {
  const content = params && isParameterized(type) ?
    PARAMETERIZED_ERROR_MESSAGES[type](params) :
    ERROR_MESSAGES[type as StaticErrorType];

  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
  });
}
