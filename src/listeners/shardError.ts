import { Listener } from '@sapphire/framework';

import { getLogger } from '@/config/logger.js';

export class ShardErrorListener extends Listener {
  constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: 'shardError',
    });
  }

  public override run(error: Error, shardId: number): void {
    getLogger().error({ shardId, error }, 'Shard error');
  }
}
