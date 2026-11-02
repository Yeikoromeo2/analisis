/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['exceljs', 'pg'],
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
};
export default nextConfig;
