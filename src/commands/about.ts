import { Command } from '@sapphire/framework';
import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
} from 'discord.js';

// Constants
import { COOLDOWN_DEFAULT, PRIVACY_URL, TERMS_URL, WEBSITE_URL } from '@/constants/config.js';

// Tasks
import { getAnnounceableVersion } from '@/tasks/announcement.js';

export class AboutCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, {
      ...options,
      name: 'about',
      description: 'Bot version, website and legal documents',
      cooldownDelay: COOLDOWN_DEFAULT,
    });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    const integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
    const contexts: InteractionContextType[] = [InteractionContextType.Guild];

    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setIntegrationTypes(integrationTypes)
        .setContexts(contexts));
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<void> {
    const version = getAnnounceableVersion()?.version ?? 'unreleased';

    await interaction.reply({
      content: `**Albion Online Objectives** — version ${version}

Website: ${WEBSITE_URL}
Terms of Use: ${TERMS_URL}
Privacy Policy: ${PRIVACY_URL}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
