import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    allowedDevOrigins: [
      "https://nonfloating-dung-violaceous.ngrok-free.dev",
      "http://localhost:3000",
      "http://192.168.1.4:3000",
    ],
  },
};

export default nextConfig;
