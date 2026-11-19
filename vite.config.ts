import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Strict Content-Security-Policy for production builds only (the dev server
// injects inline scripts for hot reload, which this policy would block).
// The app only ever talks to api.github.com. Fonts are bundled with the app.
// The demo build (`--mode demo`) runs inside a Claude artifact, which sets its own policy.
const csp: Plugin = {
  name: 'bookjournal-csp',
  apply: (_, env) => env.command === 'build' && env.mode !== 'demo',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src https://api.github.com",
      "manifest-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "object-src 'none'",
    ].join('; ');
    return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${policy}">`);
  },
};

export default defineConfig(({ mode }) => ({
  // Relative base so the build works at a domain root (Cloudflare Pages)
  // and under a sub-path (GitHub Pages: /bookjournal/).
  base: './',
  plugins: [react(), csp],
  // The demo is packed into one HTML file (npm run demo), so keep it to one script.
  build: mode === 'demo' ? { rollupOptions: { output: { inlineDynamicImports: true } } } : undefined,
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
