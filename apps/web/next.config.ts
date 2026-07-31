import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Next 16 only serves qualities declared here; PhoneFrame asks for 92.
  images: { qualities: [75, 92] },
};

export default nextConfig;
