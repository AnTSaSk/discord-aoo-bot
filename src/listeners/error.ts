import { Listener } from '@sapphire/framework';

import { getLogger } from '@/config/logger.js';

export class ErrorListener extends Listener {
  constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: 'error',
    });
  }

  public override run(error: Error): void {
    getLogger().error({ error }, 'Discord client error');
  }
}
