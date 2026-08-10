import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the Docker runner stage stays small
  // and does not need node_modules copied in.
  output: "standalone",
};

export default nextConfig;
