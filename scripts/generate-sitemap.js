const fs = require("node:fs/promises");
const path = require("node:path");

const siteUrl = (process.env.SITE_URL || "https://www.amrishkhan.dev").replace(/\/+$/, "");
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
        title: article.title || "Untitled article",
        description: article.description || "",
        publishedAt: article.published_at || article.published_timestamp || article.created_at || null,
        modifiedAt: article.edited_at || article.updated_at || article.published_at || article.published_timestamp || article.created_at || null,
        tags: Array.isArray(article.tag_list) ? article.tag_list : [],
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

const renderFeed = (articles) => {
  const latestDate = articles.find((article) => article.modifiedAt || article.publishedAt)?.modifiedAt || articles.find((article) => article.publishedAt)?.publishedAt || new Date().toISOString();
  const items = articles
    .map((article) => {
      const publishedDate = article.publishedAt ? new Date(article.publishedAt).toUTCString() : new Date().toUTCString();
      const modifiedDate = article.modifiedAt ? new Date(article.modifiedAt).toUTCString() : publishedDate;

      return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(article.loc)}</link>
      <guid isPermaLink="true">${escapeXml(article.loc)}</guid>
      <description>${escapeXml(article.description || `Read ${article.title} by Amrish Khan.`)}</description>
      <pubDate>${escapeXml(publishedDate)}</pubDate>
      <lastBuildDate>${escapeXml(modifiedDate)}</lastBuildDate>
      ${article.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join("\n      ")}
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>amrishkhan.dev - Tech Writing</title>
    <link>${escapeXml(`${siteUrl}/`)}</link>
    <atom:link href="${escapeXml(absoluteUrl("/feed.xml"))}" rel="self" type="application/rss+xml" />
    <description>Practical engineering guides by Amrish Khan.</description>
    <language>en</language>
    <lastBuildDate>${escapeXml(new Date(latestDate).toUTCString())}</lastBuildDate>
${items}
  </channel>
</rss>
`;
};

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
  await fs.writeFile(path.join(outputDir, "feed.xml"), renderFeed(blogUrls), "utf8");
  await fs.writeFile(
    path.join(outputDir, "robots.txt"),
    `User-agent: *
Allow: /

Sitemap: ${absoluteUrl("/sitemap.xml")}
`,
    "utf8",
  );

  console.log(`Generated sitemap.xml, feed.xml, and robots.txt with ${urls.length} URL(s).`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
