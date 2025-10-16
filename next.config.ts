import type { NextConfig } from "next";
import path from "node:path";

const LOADER = path.resolve(__dirname, 'src/visual-edits/component-tagger-loader.js');

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  outputFileTracingRoot: path.resolve(__dirname, '../../'),
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  turbopack: {
    rules: {
      "*.{jsx,tsx}": {
        loaders: [LOADER]
      }
    }
  }
};
// next.config.ts
const repo = "wordpress-plugin-code-replication";

const nextConfig = {
  output: "export",          // genera HTML statico in /out
  images: { unoptimized: true }, // disattiva Image Optimization (richiede server)
  basePath: `/${repo}`,      // necessario perché GitHub Pages pubblica in /<repo>
  assetPrefix: `/${repo}/`,  // assicura che asset e chunk puntino al sotto-path
  trailingSlash: true,       // produce /percorso/index.html (compatibile hosting statico)
};

export default nextConfig;
