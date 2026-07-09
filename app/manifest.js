import { BRAND, SEO_BY_LANG, getBaseUrl } from "@/lib/seo.js";

export default function manifest() {
  const baseUrl = getBaseUrl().replace(/\/$/, "");
  const seo = SEO_BY_LANG.en;
  return {
    name: seo.title,
    short_name: BRAND.shortName,
    description: seo.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#E7F3FF",
    theme_color: "#1d9bf0",
    orientation: "portrait-primary",
    categories: ["utilities", "productivity"],
    icons: [
      { src: "/icon.png", sizes: "48x48", type: "image/png", purpose: "any" },
      { src: "/favicon.ico", sizes: "32x32", type: "image/x-icon", purpose: "any" },
      { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    prefer_related_applications: false,
    related_applications: [],
  };
}
