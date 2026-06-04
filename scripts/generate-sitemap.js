const fs = require("node:fs/promises");
const path = require("node:path");

const siteUrl = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://amrishkhan.dev");
const devUsername = process.env.DEV_USERNAME || "amrishkhan05";
const outputDir = path.join(__dirname, "..", "public");

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const absoluteUrl = (pathname) => new URL(pathname, siteUrl).toString();

const fetchDevArticles = async () => {
  const articles = [];
  const perPage = 100;

  for (let page = 1; page <= 10; page += 1) {
    const url = new URL("https://dev.to/api/articles");
    url.searchParams.set("username", devUsername);
    url.searchParams.set("per_page", String(perPage));
    if (page > 1) {
      url.searchParams.set("page", String(page));
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "amrishkhan.dev sitemap generator",
      },
    });

    if (!response.ok) {
      throw new Error(`DEV API failed with ${response.status}`);
    }

    const pageArticles = await response.json();
    if (!Array.isArray(pageArticles) || pageArticles.length === 0) {
      break;
    }

    articles.push(...pageArticles);

    if (pageArticles.length < perPage) {
      break;
    }
  }

  const seen = new Set();
  return articles
    .map((article) => {
      const slug = article.slug || slugify(article.title || "");
      const key = String(article.id || slug);
      if (!slug || seen.has(key)) {
        return null;
      }
      seen.add(key);
      return {
        loc: absoluteUrl(`/blog/${slug}`),
        lastmod: article.published_at || article.published_timestamp || article.created_at || null,
        priority: "0.7",
      };
    })
    .filter(Boolean);
};

const renderSitemap = (urls) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((url) => {
    const lastmod = url.lastmod ? `\n    <lastmod>${escapeXml(String(url.lastmod).slice(0, 10))}</lastmod>` : "";
    return `  <url>
    <loc>${escapeXml(url.loc)}</loc>${lastmod}
    <priority>${escapeXml(url.priority)}</priority>
  </url>`;
  })
  .join("\n")}
</urlset>
`;

const main = async () => {
  let blogUrls = [];

  try {
    blogUrls = await fetchDevArticles();
  } catch (error) {
    console.warn(`Sitemap generated without DEV articles: ${error.message}`);
  }

  const urls = [
    { loc: absoluteUrl("/"), priority: "1.0" },
    { loc: absoluteUrl("/aruvix"), priority: "0.9" },
    ...blogUrls,
  ];

  await fs.writeFile(path.join(outputDir, "sitemap.xml"), renderSitemap(urls), "utf8");
  await fs.writeFile(
    path.join(outputDir, "robots.txt"),
    `User-agent: *
Allow: /

Sitemap: ${absoluteUrl("/sitemap.xml")}
`,
    "utf8",
  );

  console.log(`Generated sitemap.xml and robots.txt with ${urls.length} URL(s).`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
