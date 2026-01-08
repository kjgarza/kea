import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const repoName = process.env.NEXT_PUBLIC_REPO_NAME || "cards-game";

const nextConfig: NextConfig = {
  output: "export", // Static export for fully static site
  basePath: isProd ? `/${repoName}` : "",
  assetPrefix: isProd ? `/${repoName}/` : "",
  images: {
    unoptimized: true, // Required for static export
  },
  trailingSlash: true, // Better compatibility with GitHub Pages
};

export default nextConfig;
