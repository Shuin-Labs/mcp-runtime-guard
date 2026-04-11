import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://mcp-runtime-guard.vercel.app',
  redirects: {
    '/': '/ja/introduction',
  },
  integrations: [
    starlight({
      title: 'mcp-runtime-guard',
      defaultLocale: 'ja',
      locales: {
        ja: { label: '日本語' },
        en: { label: 'English' },
      },
      sidebar: [
        {
          label: 'はじめに',
          translations: { en: 'Getting Started' },
          items: [
            { slug: 'introduction' },
            { slug: 'quickstart' },
          ],
        },
        {
          label: 'ガイド',
          translations: { en: 'Guides' },
          items: [
            { slug: 'guides/claude-desktop' },
            { slug: 'guides/cursor' },
          ],
        },
        {
          label: 'リファレンス',
          translations: { en: 'Reference' },
          items: [
            { slug: 'reference/policy-yaml' },
            { slug: 'reference/cli' },
            { slug: 'reference/log-format' },
          ],
        },
      ],
    }),
  ],
});
