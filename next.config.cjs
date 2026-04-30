function readBasePath() {
  const b = process.env.NEXT_PUBLIC_BASE_PATH;
  if (!b) return '';
  let s = String(b).replace(/\/$/, '');
  if (s && !s.startsWith('/')) s = `/${s}`;
  return s;
}

const basePath = readBasePath();

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(basePath ? { basePath } : {}),
  experimental: {
    serverComponentsExternalPackages: ['@notionhq/client'],
  },
};

module.exports = nextConfig;
