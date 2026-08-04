import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // npm hoists connectkit to the repo root but nests wagmi in this workspace
  // (its state deps conflict with the mobile app's), so connectkit can't
  // resolve wagmi on its own. Point everyone at this workspace's copy.
  turbopack: {
    resolveAlias: {
      wagmi: "./node_modules/wagmi",
      "wagmi/*": "./node_modules/wagmi/*",
      "@wagmi/connectors": "./node_modules/@wagmi/connectors",
      "@wagmi/core": "./node_modules/@wagmi/core",
      "@wagmi/core/*": "./node_modules/@wagmi/core/*",
    },
  },
  // Next 16 only serves qualities declared here; PhoneFrame asks for 92.
  // Optimized screenshots never change without a filename change, so let
  // browsers and the CDN keep them for a year.
  images: { qualities: [75, 92], minimumCacheTTL: 31536000 },
  async headers() {
    return [
      {
        source: "/:dir(screenshots|recordings)/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
