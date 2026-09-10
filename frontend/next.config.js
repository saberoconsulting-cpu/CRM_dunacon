/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  images: { unoptimized: true },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${process.env.NEXT_PUBLIC_API || 'http://localhost:3001'}/api/:path*` },
      { source: '/uploads/:path*', destination: `${process.env.NEXT_PUBLIC_API || 'http://localhost:3001'}/uploads/:path*` },
    ];
  },
};

module.exports = nextConfig;
