import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL || "https://usnumhub.com";
  const root = base.replace(/\/$/, "");
  const ts = new Date();
  return [
    { url: `${root}/`, lastModified: ts, changeFrequency: "weekly", priority: 1 },
    { url: `${root}/login`, lastModified: ts, changeFrequency: "monthly", priority: 0.6 },
    { url: `${root}/register`, lastModified: ts, changeFrequency: "monthly", priority: 0.6 },
  ];
}
