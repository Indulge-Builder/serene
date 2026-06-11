import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    serverActions: {
      // Voice-note transcription uploads audio via a server action. Chrome/Firefox
      // record low-bitrate opus (~0.5 MB at the 2-min cap) but Safari records
      // mp4/aac and may ignore the bitrate hint — the 1 MB default intermittently
      // rejects those. Schema-level cap stays at 3 MB (transcription-schema.ts).
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // microphone=(self): voice-note dictation on /leads/[id] records in-app
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
