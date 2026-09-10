import type { NextConfig } from 'next';

// Codespaces (and similar cloud dev environments) serve the app through a
// forwarding proxy whose public hostname differs from what Next sees as its
// own origin. Server Actions refuse cross-origin requests by default, so the
// forwarded hostname has to be allow-listed explicitly or every POST to a
// Server Action (including Clerk's sign-in form) is rejected.
const codespaceName = process.env.CODESPACE_NAME;
const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev';

const allowedOrigins = ['localhost:3000', '127.0.0.1:3000'];
if (codespaceName) {
  allowedOrigins.push(`${codespaceName}-3000.${forwardingDomain}`);
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
};

export default nextConfig;
