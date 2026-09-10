import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/login", "/signup", "/forgot-password"],
      disallow: ["/account", "/admin", "/reset-password"],
    },
    sitemap: "https://console.quantifyterminal.com/sitemap.xml",
  };
}
