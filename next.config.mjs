import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isStatic = process.env.EXPORT_STATIC !== "false";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  images: {
    unoptimized: true,
  },
  // Allow MongoDB server-side code to build properly
  serverExternalPackages: ["mongodb"],
  eslint: {
    // Disable ESLint during production build since we lint separately
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Ignore TypeScript build errors temporarily during initial migration steps
    ignoreBuildErrors: true,
  },
  outputFileTracingRoot: __dirname,
  webpack: (config) => {
    config.cache = false;
    return config;
  },
};

export default nextConfig;
