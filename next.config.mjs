/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["openai"],
  },
  serverExternalPackages: ["openai"],
};

export const maxDuration = 60;

export default nextConfig;