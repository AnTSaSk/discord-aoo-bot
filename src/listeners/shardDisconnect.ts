import { Listener } from '@sapphire/framework';

import { getLogger } from '@/config/logger.js';

export class ShardDisconnectListener extends Listener {
  constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: 'shardDisconnect',
    });
  }

  public override run(closeEvent: CloseEvent, shardId: number): void {
    getLogger().warn({ shardId, code: closeEvent.code }, 'Shard disconnected');
  }
}
