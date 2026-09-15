/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/api/pms/:path*", destination: "http://localhost:8000/api/v1/:path*" }];
  },
};

module.exports = nextConfig;
