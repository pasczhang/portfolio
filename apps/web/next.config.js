/** @type {import('next').NextConfig} */
const staticExport =
  process.env.NEXT_OUTPUT === "export" || process.env.npm_lifecycle_event === "build:cf";

const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: staticExport },
};

if (staticExport) {
  nextConfig.output = "export";
  nextConfig.trailingSlash = true;
} else {
  nextConfig.rewrites = async () => [
    { source: "/api/pms/:path*", destination: "http://localhost:8000/api/v1/:path*" },
  ];
}

module.exports = nextConfig;
