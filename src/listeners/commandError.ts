import { Listener, type ChatInputCommandErrorPayload } from '@sapphire/framework';

import { getLogger } from '@/config/logger.js';

export class CommandErrorListener extends Listener {
  constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: 'chatInputCommandError',
    });
  }

  public override run(error: unknown, payload: ChatInputCommandErrorPayload): void {
    getLogger().error(
      {
        command: payload.command.name,
        guildId: payload.interaction.guildId,
        error,
      },
      'Command execution error',
    );
  }
}
