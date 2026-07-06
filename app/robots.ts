import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/seo.js";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/kamikaze/"] },
      { userAgent: "Googlebot", allow: "/", disallow: ["/api/", "/kamikaze/"] },
      { userAgent: "Bingbot", allow: "/", disallow: ["/api/", "/kamikaze/"] },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl.replace(/^https?:\/\//, ""),
  };
}
