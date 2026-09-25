import type { NextConfig } from "next";

// Pin the process timezone before anything reads a Date. The app uses naive
// calendar-date handling that assumes server and clients share one timezone;
// Vercel's runtime defaults to UTC, which shifted all-day due dates by a day
// for +6 users. instrumentation.ts sets this too, but doing it here guarantees
// it runs before any module-load Date usage. Override with APP_TZ.
process.env.TZ = process.env.APP_TZ || "Asia/Dhaka";

const nextConfig: NextConfig = {
  // pdfkit reads its .afm font-metric files from disk at runtime; exceljs is a
  // heavy CJS package. Keep both out of the server bundle so they load from
  // node_modules directly (avoids missing-font runtime errors in production).
  serverExternalPackages: ["pdfkit", "exceljs"],
  experimental: {
    staleTimes: {
      // Visited routes stay instant from the client router cache for 5 min —
      // matches react-query's staleTime; realtime subscriptions and background
      // refetches keep the content itself live.
      dynamic: 300,
      static: 300,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.figma.com",
        pathname: "/api/mcp/asset/**",
      },
    ],
  },
};

export default nextConfig;
