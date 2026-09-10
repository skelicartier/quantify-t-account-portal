import type { MetadataRoute } from "next";

const baseUrl = "https://console.quantifyterminal.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${baseUrl}/login`,
      lastModified: new Date("2026-09-11"),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${baseUrl}/signup`,
      lastModified: new Date("2026-09-11"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/forgot-password`,
      lastModified: new Date("2026-09-11"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
