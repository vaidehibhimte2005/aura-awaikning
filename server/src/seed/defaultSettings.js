/**
 * Default CMS content. Used until an editor saves their own version from the
 * Website Content screen, so the site never renders empty.
 */
export const DEFAULT_SETTINGS = {
  general: {
    siteName: 'Aura Awakening',
    tagline: 'Awareness · Mindfulness · Growth',
    email: 'hello@auraawakening.com',
    phone: '+91 98765 43210',
    address: 'Rishikesh, Uttarakhand, India',
    socials: {
      instagram: 'https://instagram.com/',
      youtube: 'https://youtube.com/',
      facebook: '',
      linkedin: '',
    },
  },
  homepage: {
    hero: {
      eyebrow: 'Aura Awakening',
      title: 'Awaken the awareness within.',
      subtitle:
        'Guided programs, live circles and quiet practices that help you return to yourself — with clarity, steadiness and an open heart.',
      primaryCta: 'Explore Programs',
      secondaryCta: 'Join a Live Session',
    },
    intro: {
      title: 'A sanctuary for the inner journey',
      body:
        'Aura Awakening brings together experienced guides, structured learning paths and live practice so that awareness becomes something you live, not just something you read about. Every program is designed to be gentle, grounded and practical for modern life.',
      stats: [
        { value: '12+', label: 'Guided programs' },
        { value: '40k', label: 'Minutes of practice' },
        { value: 'Weekly', label: 'Live circles' },
      ],
    },
    philosophy: {
      title: 'Our approach',
      subtitle: 'Simple practices, held with depth.',
      pillars: [
        { title: 'Presence', body: 'We begin with the breath and the body — the doorway to everything else.' },
        { title: 'Understanding', body: 'Clear teaching that respects tradition and speaks to modern life.' },
        { title: 'Integration', body: 'Small daily rituals that let awareness settle into how you live and relate.' },
        { title: 'Community', body: 'Live sessions and shared practice, because growth is gentler together.' },
      ],
    },
    cta: {
      title: 'Begin your journey inward.',
      body: 'Start with a free program or join our next live circle. There is no right moment — only this one.',
      buttonLabel: 'Begin Your Journey',
    },
  },
  about: {
    title: 'About Aura Awakening',
    lead: 'We exist to make awareness practical, approachable and deeply personal.',
    body:
      'Aura Awakening began as a small weekly meditation circle and grew into a learning home for people who want more steadiness, clarity and compassion in their lives.\n\nOur guides come from contemplative, therapeutic and movement traditions. Together we design programs that are structured enough to build a habit, and spacious enough to let your own insight lead.\n\nWe do not promise transformation overnight. We offer a path, good company, and practices that work when you return to them.',
    values: [
      { title: 'Grounded', body: 'Rooted in practice, free from hype.' },
      { title: 'Inclusive', body: 'Welcoming to every background and belief.' },
      { title: 'Respectful', body: 'Honouring the lineages we learn from.' },
    ],
  },
  legal: {
    privacy: '',
    terms: '',
    refund: '',
  },
};
