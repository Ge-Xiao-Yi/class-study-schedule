import type { NextConfig } from "next";

const pages = process.env.PAGES_BUILD === "1";
const basePath = pages ? "/class-study-schedule" : "";
const nextConfig: NextConfig = {
  ...(pages ? { output: "export", trailingSlash: true } : {}),
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
export default nextConfig;
