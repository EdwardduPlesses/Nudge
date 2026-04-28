import type { NextConfig } from "next";
import { withWhopAppConfig } from "@whop/react/next.config";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://whop.com https://www.whop.com https://dash.whop.com https://*.whop.com;",
          },
        ],
      },
    ];
  },
};

export default withWhopAppConfig(nextConfig);
