/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@notionhq/client'],
  },
};

module.exports = nextConfig;
