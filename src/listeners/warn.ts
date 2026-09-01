import { Listener } from '@sapphire/framework';

import { getLogger } from '@/config/logger.js';

export class WarnListener extends Listener {
  constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: 'warn',
    });
  }

  public override run(message: string): void {
    getLogger().warn({ message }, 'Discord client warning');
  }
}
