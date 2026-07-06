import { getBaseUrl } from "@/lib/seo.js";

const LANGS = ["en", "tr", "de", "es"];

function langUrls(baseUrl, path) {
  const pathNorm = path.startsWith("/") ? path : `/${path}`;
  const languages = {};
  LANGS.forEach((lang) => {
    languages[lang] = lang === "en" ? `${baseUrl}${pathNorm}` : `${baseUrl}${pathNorm}?lang=${lang}`;
  });
  return languages;
}

export default function sitemap() {
  const baseUrl = getBaseUrl().replace(/\/$/, "");
  const now = new Date();

  const routes = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/gecmis", priority: 0.7, changeFrequency: "weekly" },
    { path: "/results", priority: 0.6, changeFrequency: "daily" },
    { path: "/terms", priority: 0.4, changeFrequency: "yearly" },
    { path: "/dmca", priority: 0.3, changeFrequency: "yearly" },
    { path: "/sss", priority: 0.5, changeFrequency: "monthly" },
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`,
    lastModified: now,
    changeFrequency,
    priority,
    alternates: { languages: langUrls(baseUrl, path) },
  }));
}
