export interface Announcement {
  version: string;
  title: string;
  // Rendered as one text block each, separated by a large separator
  sections: string[];
  // Rendered small, below the last separator
  footer: string;
}

// Fallback notice, appended only when the target channel came from the last-used fallback
export const ANNOUNCEMENT_FALLBACK_NOTICE =
  'No announcement channel is set yet, so this message landed in the last channel where the bot was used. An admin can pick a dedicated one with `/settings announcement-channel`.';

export const ANNOUNCEMENTS: Announcement[] = [
  {
    version: '0.2.1',
    title: '## The bot now announces its own updates ##',
    sections: [
      'A new version of Albion Online Objectives is live. Starting today, the bot posts a message like this one on your server whenever an update ships.',
      `Two commands come with it.

\`/settings\`, for members with the **Manage Server** permission:
- \`/settings announcement-channel\` picks the channel where announcements land
- \`/settings announcements\` turns them on or off, with an optional \`@everyone\` mention
- \`/settings show\` displays the current configuration

\`/about\`, open to everyone: bot version, website link, terms of use and privacy policy.`,
    ],
    footer: 'Nothing will ever ping `@everyone` unless an admin turns it on. It is off by default.',
  },
  {
    version: '0.3.0',
    title: '## Ancient Lands Portals and Dragon attacks are now trackable ##',
    sections: [
      `Two new objective types join nodes, cores and vortexes.

**Ancient Lands Portals**: pick the portal size when you add one — Small (1-5 players), Medium (5-7) or Large (15-20).

**Dragon attacks**: leave the rarity field empty when you add one, there is nothing to pick for a Dragon.`,
    ],
    footer: 'Need a refresher on the commands? `/settings` and `/about` are still there.',
  },
];
