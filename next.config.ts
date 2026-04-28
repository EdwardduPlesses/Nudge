import type { NextConfig } from "next";
import { withWhopAppConfig } from "@whop/react/next.config";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

export default withWhopAppConfig(nextConfig);
