/** @format */

require("dotenv").config();

const express = require("express");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const app = express();
const port = process.env.PORT || 3333;
const hasKvConfig = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const kvBaseUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;
const kvViewsKey = "amrishkhan.dev:portfolio:views";
const kvUpdatedAtKey = "amrishkhan.dev:portfolio:updatedAt";
const devUsername = process.env.DEV_USERNAME || "amrishkhan05";
const devApiKey = process.env.DEV_API_KEY || null;
const devApiBaseUrl = "https://dev.to/api";
const devArticlesPerPage = 100;
const devMaxArticlePages = 10;
const devListCacheTtlMs = Number.parseInt(process.env.DEV_LIST_CACHE_TTL_MS || "", 10) || 1000 * 60 * 15;
const devArticleCacheTtlMs = Number.parseInt(process.env.DEV_ARTICLE_CACHE_TTL_MS || "", 10) || 1000 * 60 * 60;
const devApiHeaders = {
  Accept: "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  "User-Agent": "amrishkhan.dev portfolio",
  "Accept-Encoding": "identity",
  ...(devApiKey ? { "api-key": devApiKey } : {}),
};
const siteUrl = (process.env.SITE_URL || "https://www.amrishkhan.dev").replace(/\/+$/, "");
const siteImageUrl = `${siteUrl}/assets/og-image.png`;
const personId = `${siteUrl}/#person`;
const devArticleListCache = new Map();
const devArticleCache = new Map();

const metricsDir = process.env.VERCEL ? path.join(os.tmpdir(), "amrishkhan-dev-metrics") : path.join(__dirname, ".data");
const metricsFilePath = path.join(metricsDir, "portfolio-views.json");
let memoryMetrics = { views: 0, updatedAt: null };
let useMemoryFallback = false;
let writeQueue = Promise.resolve();

app.set("etag", false);

const noStoreHeaderValue = "no-store, no-cache, max-age=0, s-maxage=0, must-revalidate, proxy-revalidate";

const setNoStoreHeaders = (res) => {
  res.set("Cache-Control", noStoreHeaderValue);
  res.set("CDN-Cache-Control", "no-store, s-maxage=0");
  res.set("Vercel-CDN-Cache-Control", "no-store, s-maxage=0");
  res.set("Surrogate-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("X-Accel-Expires", "0");
};

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const toValidDateTime = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : value;
};

const getFreshness = (entry, ttlMs) => Boolean(entry?.value && Date.now() - entry.fetchedAt < ttlMs);

const withCacheMeta = (result, cacheState, warning) => ({
  ...result,
  meta: {
    ...result.meta,
    cache: cacheState,
    ...(warning ? { warning } : {}),
  },
});

const stripHtml = (value) =>
  String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const estimateWordCount = (article) => {
  const text = stripHtml(article?.body_markdown || article?.body_html || article?.description || "");
  return text ? text.split(/\s+/).length : null;
};

const getArticleWordCount = (article) => {
  const explicitWordCount = Number(article?.word_count);
  if (Number.isFinite(explicitWordCount) && explicitWordCount > 0) {
    return explicitWordCount;
  }

  return estimateWordCount(article);
};

const normalizeTags = (article) => {
  if (Array.isArray(article?.tag_list) && article.tag_list.length) {
    return article.tag_list;
  }

  if (typeof article?.tag_list === "string" && article.tag_list.trim()) {
    return article.tag_list
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (Array.isArray(article?.tags) && article.tags.length) {
    return article.tags;
  }

  if (typeof article?.tags === "string" && article.tags.trim()) {
    return article.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeDevArticle = (article) => {
  if (!isRecord(article)) {
    return null;
  }

  const title = article?.title || "Untitled article";
  const devSlug = article?.slug || slugify(title);
  const publishedAt = toValidDateTime(article?.published_at || article?.published_timestamp || article?.created_at || null);
  const modifiedAt = toValidDateTime(article?.edited_at || article?.updated_at || article?.published_at || article?.published_timestamp || article?.created_at || null);
  const tags = normalizeTags(article);

  return {
    id: article?.id || `${devSlug}:${publishedAt || title}`,
    title,
    localSlug: slugify(title),
    devSlug,
    description: article?.description || "",
    publishedAt,
    modifiedAt,
    tags,
    readingTimeMinutes: article?.reading_time_minutes || null,
    wordCount: getArticleWordCount(article),
    coverImage: article?.cover_image || article?.social_image || null,
    coverImageFallback: article?.social_image && article?.social_image !== article?.cover_image ? article.social_image : null,
    url: `/blog/${devSlug}`,
    devUrl: article?.url || null,
    source: "dev",
  };
};

const getArticleDedupeKey = (article) => String(article?.id || article?.devUrl || article?.devSlug || article?.localSlug);

const sortNewestFirst = (a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();

const dedupeArticles = (articles) => {
  const seen = new Set();

  return articles.filter((article) => {
    const key = getArticleDedupeKey(article);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const parsePositiveInt = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
};

const buildFreshDevUrl = (pathname, params = {}) => {
  const pathSuffix = String(pathname).startsWith("/") ? String(pathname) : `/${pathname}`;
  const url = new URL(`${devApiBaseUrl}${pathSuffix}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  url.searchParams.set("_ts", Date.now().toString());
  return url.toString();
};

const fetchDevJson = async (url) => {
  const attempts = 2;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: devApiHeaders,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`DEV API request failed: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
};

const fetchDevArticlePage = async ({ page = 1, perPage = devArticlesPerPage } = {}) => {
  const query = {
    username: devUsername,
    per_page: perPage,
  };

  // DEV API can return stale/missing items when page=1 is passed explicitly.
  if (page > 1) {
    query.page = page;
  }

  const url = buildFreshDevUrl("/articles", query);
  console.log("dev", url);
  const articles = await fetchDevJson(url);

  if (!Array.isArray(articles)) {
    throw new Error(`DEV API returned an invalid article list for page ${page}.`);
  }

  return articles;
};

const fetchMappedDevBlogs = async ({ page = 1, perPage = devArticlesPerPage, fetchAll = true } = {}) => {
  const safePage = parsePositiveInt(page, 1);
  const safePerPage = parsePositiveInt(perPage, devArticlesPerPage, devArticlesPerPage);
  const rawArticles = [];

  if (fetchAll) {
    for (let nextPage = 1; nextPage <= devMaxArticlePages; nextPage += 1) {
      const pageArticles = await fetchDevArticlePage({
        page: nextPage,
        perPage: safePerPage,
      });
      rawArticles.push(...pageArticles);

      if (pageArticles.length < safePerPage) {
        break;
      }
    }
  } else {
    rawArticles.push(...(await fetchDevArticlePage({ page: safePage, perPage: safePerPage })));
  }

  const normalizedArticles = rawArticles.map(normalizeDevArticle).filter(Boolean).sort(sortNewestFirst);
  const blogs = dedupeArticles(normalizedArticles);

  if (blogs.length !== normalizedArticles.length) {
    console.warn(`DEV article dedupe removed ${normalizedArticles.length - blogs.length} duplicate item(s).`);
  }

  console.log(`DEV articles fetched: raw=${rawArticles.length}, normalized=${normalizedArticles.length}, rendered=${blogs.length}, page=${safePage}, perPage=${safePerPage}, fetchAll=${fetchAll}`);

  return {
    blogs,
    meta: {
      username: devUsername,
      source: "dev",
      authMode: devApiKey ? "api-key" : "public",
      rawCount: rawArticles.length,
      normalizedCount: normalizedArticles.length,
      renderedCount: blogs.length,
      page: safePage,
      perPage: safePerPage,
      fetchedAt: new Date().toISOString(),
      cache: "network",
    },
  };
};

const getCachedDevBlogs = async ({ page = 1, perPage = devArticlesPerPage, fetchAll = true } = {}) => {
  const safePage = parsePositiveInt(page, 1);
  const safePerPage = parsePositiveInt(perPage, devArticlesPerPage, devArticlesPerPage);
  const cacheKey = `${safePage}:${safePerPage}:${fetchAll ? "all" : "page"}`;
  const cached = devArticleListCache.get(cacheKey);

  if (getFreshness(cached, devListCacheTtlMs)) {
    return withCacheMeta(cached.value, "hit");
  }

  try {
    const result = await fetchMappedDevBlogs({ page: safePage, perPage: safePerPage, fetchAll });
    devArticleListCache.set(cacheKey, { value: result, fetchedAt: Date.now() });
    return withCacheMeta(result, "network");
  } catch (error) {
    if (cached?.value) {
      console.error("Serving stale DEV article list cache:", error);
      return withCacheMeta(cached.value, "stale", "Serving cached DEV articles because DEV.to is temporarily unavailable.");
    }

    throw error;
  }
};

const escapeHtml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const escapeXml = escapeHtml;

const escapeJsonForHtml = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

const formatXmlDate = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const renderSitemapXml = (blogs = []) => {
  const urls = [
    { loc: `${siteUrl}/`, priority: "1.0" },
    { loc: `${siteUrl}/aruvix`, priority: "0.9" },
    ...blogs.map((blog) => ({
      loc: absoluteUrl(blog.url),
      lastmod: blog.modifiedAt || blog.publishedAt,
      priority: "0.7",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((url) => {
    const lastmod = formatXmlDate(url.lastmod);
    return `  <url>
    <loc>${escapeXml(url.loc)}</loc>${lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : ""}
    <priority>${escapeXml(url.priority)}</priority>
  </url>`;
  })
  .join("\n")}
</urlset>
`;
};

const renderFeedXml = (blogs = []) => {
  const latestDate = blogs.find((blog) => blog.modifiedAt || blog.publishedAt)?.modifiedAt || blogs.find((blog) => blog.publishedAt)?.publishedAt || new Date().toISOString();
  const items = blogs
    .map((blog) => {
      const link = absoluteUrl(blog.url);
      const publishedDate = blog.publishedAt ? new Date(blog.publishedAt).toUTCString() : new Date().toUTCString();
      const modifiedDate = blog.modifiedAt ? new Date(blog.modifiedAt).toUTCString() : publishedDate;

      return `    <item>
      <title>${escapeXml(blog.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <description>${escapeXml(blog.description || `Read ${blog.title} by Amrish Khan.`)}</description>
      <pubDate>${escapeXml(publishedDate)}</pubDate>
      <lastBuildDate>${escapeXml(modifiedDate)}</lastBuildDate>
      ${blog.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join("\n      ")}
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

const renderCanonicalHelperText = (blogs = []) =>
  blogs
    .map((blog) =>
      [
        `Title: ${blog.title}`,
        `DEV.to: ${blog.devUrl || "Not provided by DEV API"}`,
        `Portfolio: ${absoluteUrl(blog.url)}`,
        `Published: ${formatXmlDate(blog.publishedAt) || "Unknown"}`,
        "DEV.to front matter:",
        `canonical_url: ${absoluteUrl(blog.url)}`,
      ].join("\n"),
    )
    .join("\n\n---\n\n");

const sanitizeDevArticleHtml = (html) => {
  if (!html) {
    return "";
  }

  return String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|option|link|meta)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|option|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, "")
    .replace(/\s+(href|src)\s*=\s*(["'])\s*data:(?!image\/(?:png|gif|jpe?g|webp|avif|svg\+xml);)[\s\S]*?\2/gi, "")
    .replace(/\s+data-[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+aria-label\s*=\s*(["'])(?:expand|fit to screen|enter fullscreen mode|exit fullscreen mode)[\s\S]*?\1/gi, "")
    .replace(/<a\b(?![^>]*\brel=)([^>]*)>/gi, '<a$1 rel="noopener noreferrer">')
    .trim();
};

const formatPublishedDate = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const renderTagList = (tags) => (Array.isArray(tags) ? tags : []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");

const injectBlogDetailContent = (html, article) => {
  const tags = Array.isArray(article.tags) ? article.tags : [];
  const metaItems = [formatPublishedDate(article.publishedAt), article.readingTimeMinutes ? `${article.readingTimeMinutes} min read` : null].filter(Boolean);
  const cover = typeof article.coverImage === "string" && /^https:\/\//i.test(article.coverImage) ? article.coverImage : null;
  const backupCover = typeof article.coverImageFallback === "string" && /^https:\/\//i.test(article.coverImageFallback) ? article.coverImageFallback : null;
  const coverImage = cover
    ? `<img class="blog-cover" id="blog-detail-cover" src="${escapeHtml(cover)}" data-fallback-src="${escapeHtml(backupCover || "")}" alt="${escapeHtml(article.title)} cover image" loading="eager" fetchpriority="high" decoding="async" width="1200" height="675" />`
    : '<img class="blog-cover" id="blog-detail-cover" alt="" loading="eager" decoding="async" width="1200" height="675" hidden />';
  const bodyHtml = sanitizeDevArticleHtml(article.bodyHtml) || (article.bodyMarkdown ? `<pre class="blog-markdown-source">${escapeHtml(article.bodyMarkdown)}</pre>` : "");

  return html
    .replace('<div class="blog-detail-status" id="blog-detail-status">Loading...</div>', '<div class="blog-detail-status" id="blog-detail-status" hidden></div>')
    .replace('<div class="blog-detail-content" id="blog-detail-content" hidden>', '<div class="blog-detail-content" id="blog-detail-content">')
    .replace(/<img class="blog-cover" id="blog-detail-cover"[\s\S]*?\/>/, coverImage)
    .replace('<h1 id="blog-detail-title"></h1>', `<h1 id="blog-detail-title">${escapeHtml(article.title)}</h1>`)
    .replace('<div class="blog-meta-row" id="blog-detail-meta"></div>', `<div class="blog-meta-row" id="blog-detail-meta">${metaItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`)
    .replace('<div class="blog-tags" id="blog-detail-tags"></div>', `<div class="blog-tags" id="blog-detail-tags">${renderTagList(tags)}</div>`)
    .replace('<div class="blog-body" id="blog-detail-body"></div>', `<div class="blog-body" id="blog-detail-body">${bodyHtml}</div>`);
};

const absoluteUrl = (pathname = "/") => new URL(pathname, siteUrl).toString();

const buildSeoTags = ({ title, description, canonicalPath, type = "website", image = siteImageUrl, twitterCard = "summary_large_image", jsonLd }) => {
  const canonicalUrl = absoluteUrl(canonicalPath);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCanonicalUrl = escapeHtml(canonicalUrl);
  const safeType = escapeHtml(type);
  const safeImage = escapeHtml(image);
  const jsonLdTag = jsonLd ? `    <script type="application/ld+json">${escapeJsonForHtml(jsonLd)}</script>\n` : "";

  return `    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}" />
    <meta name="author" content="Amrish Khan" />
    <link rel="canonical" href="${safeCanonicalUrl}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:url" content="${safeCanonicalUrl}" />
    <meta property="og:type" content="${safeType}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:site_name" content="amrishkhan.dev" />
    <meta name="twitter:card" content="${escapeHtml(twitterCard)}" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${safeImage}" />
${jsonLdTag}`;
};

const replaceSeoHead = (html, seoTags) => {
  const withoutStaticSeo = html
    .replace(/\s*<title>[\s\S]*?<\/title>/i, "")
    .replace(/\s*<meta\s+name="description"[\s\S]*?>/gi, "")
    .replace(/\s*<meta\s+name="author"[\s\S]*?>/gi, "")
    .replace(/\s*<link\s+rel="canonical"[\s\S]*?>/gi, "")
    .replace(/\s*<meta\s+property="og:[\s\S]*?>/gi, "")
    .replace(/\s*<meta\s+name="twitter:[\s\S]*?>/gi, "")
    .replace(/\s*<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi, "");

  return withoutStaticSeo.replace(/(<meta\s+name="color-scheme"\s+content="[^"]+"\s*\/>\n)/, `$1${seoTags}`);
};

const getPersonJsonLd = () => ({
  "@type": "Person",
  "@id": personId,
  name: "Amrish Khan",
  alternateName: "Amrishkhan Sheik Abdullah",
  url: `${siteUrl}/`,
  jobTitle: "Full Stack AI Engineer, TypeScript Architect, Founder of Aruvix",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Dubai",
    addressCountry: "AE",
  },
  sameAs: ["https://www.linkedin.com/in/amrishkhan", "https://github.com/amrishkhan05", "https://www.npmjs.com/package/sql-select-query-generator", "https://www.aruvix.com/"],
  knowsAbout: ["TypeScript", "AI engineering", "Angular", "React", "Node.js", "NestJS", "Microservices", "API design", "Payment integrations"],
});

const mapFullDevArticle = (article) => {
  const mappedArticle = normalizeDevArticle(article);

  if (!mappedArticle) {
    return null;
  }

  return {
    ...mappedArticle,
    description: article.description || mappedArticle.description,
    publishedAt: article.published_at || article.published_timestamp || mappedArticle.publishedAt,
    modifiedAt: toValidDateTime(article.edited_at || article.updated_at || article.published_at || article.published_timestamp || mappedArticle.modifiedAt),
    tags: normalizeTags(article),
    coverImage: article.cover_image || article.social_image || mappedArticle.coverImage,
    coverImageFallback: article.social_image && article.social_image !== article.cover_image ? article.social_image : mappedArticle.coverImageFallback,
    wordCount: estimateWordCount(article),
    bodyHtml: article.body_html || "",
    bodyMarkdown: article.body_markdown || "",
    source: "dev",
  };
};

const fetchFullDevArticle = async (slug) => {
  const article = await fetchDevJson(buildFreshDevUrl(`/articles/${encodeURIComponent(devUsername)}/${encodeURIComponent(slug)}`));

  if (!isRecord(article)) {
    throw new Error("DEV API returned a malformed article payload.");
  }

  const mappedArticle = mapFullDevArticle(article);

  if (!mappedArticle) {
    throw new Error("DEV API returned an article that could not be normalized.");
  }

  return mappedArticle;
};

const getCachedFullDevArticle = async (slug) => {
  const cacheKey = String(slug || "");
  const cached = devArticleCache.get(cacheKey);

  if (getFreshness(cached, devArticleCacheTtlMs)) {
    return cached.value;
  }

  try {
    const article = await fetchFullDevArticle(cacheKey);
    devArticleCache.set(cacheKey, { value: article, fetchedAt: Date.now() });
    devArticleCache.set(article.devSlug, { value: article, fetchedAt: Date.now() });
    devArticleCache.set(article.localSlug, { value: article, fetchedAt: Date.now() });
    return article;
  } catch (error) {
    if (cached?.value) {
      console.error(`Serving stale DEV article cache for ${cacheKey}:`, error);
      return cached.value;
    }

    throw error;
  }
};

const getBlogArticleForSeo = async (slug) => {
  try {
    return await getCachedFullDevArticle(slug);
  } catch (directError) {
    try {
      const { blogs } = await getCachedDevBlogs();
      const listedArticle = blogs.find((article) => article.localSlug === slug || article.devSlug === slug);

      if (!listedArticle || listedArticle.devSlug === slug) {
        throw directError;
      }

      return await getCachedFullDevArticle(listedArticle.devSlug);
    } catch (fallbackError) {
      console.error(`Could not read DEV article SEO data for ${slug}:`, fallbackError);
      return null;
    }
  }
};

const renderBlogPage = async (article) => {
  // Keep the original long-form article reader styling without leaking legacy
  // homepage grid/section rules into the redesigned portfolio.
  const indexHtml = (await fs.readFile(path.join(__dirname, "public", "index.html"), "utf8"))
    .replace(
      '<link rel="stylesheet" href="/site-redesign.css?v=5" />',
      ['<link rel="stylesheet" href="/styles.css?v=4" />', '<link rel="stylesheet" href="/site-redesign.css?v=5" />'].join("\n"),
    );
  // The response already has article content: never paint a homepage/loading flash.
  const readyHtml = indexHtml.replace('classList.add("is-blog-route", "is-blog-loading")', 'classList.add("is-blog-route", "is-blog-ready")');
  const canonicalPath = article.url;
  const description = article.description || `Read ${article.title} by Amrish Khan on amrishkhan.dev.`;
  const image = article.coverImage || siteImageUrl;
  const articleSection = Array.isArray(article.tags) && article.tags.length ? article.tags[0] : "Software Engineering";
  const wordCount = Number.isFinite(Number(article.wordCount)) ? Number(article.wordCount) : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description,
    url: absoluteUrl(canonicalPath),
    image,
    thumbnailUrl: image,
    datePublished: article.publishedAt,
    dateModified: article.modifiedAt || article.publishedAt,
    author: {
      "@type": "Person",
      "@id": personId,
      name: "Amrish Khan",
      url: `${siteUrl}/`,
    },
    publisher: getPersonJsonLd(),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": absoluteUrl(canonicalPath),
    },
    articleSection,
    ...(wordCount ? { wordCount } : {}),
    keywords: Array.isArray(article.tags) ? article.tags.join(", ") : "",
    ...(article.devUrl ? { isBasedOn: article.devUrl, sameAs: article.devUrl } : {}),
  };

  return injectBlogDetailContent(
    replaceSeoHead(
      readyHtml,
      buildSeoTags({
        title: `${article.title} | amrishkhan.dev`,
        description,
        canonicalPath,
        type: "article",
        image,
        twitterCard: "summary_large_image",
        jsonLd,
      }),
    ),
    article,
  );
};

const kvGet = async (key) => {
  const response = await fetch(`${kvBaseUrl}/get/${encodeURIComponent(key)}`, {
    headers: {
      Authorization: `Bearer ${kvToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`KV GET failed for ${key}: ${response.status}`);
  }

  const payload = await response.json();
  return payload.result;
};

const kvSet = async (key, value) => {
  const response = await fetch(`${kvBaseUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    headers: {
      Authorization: `Bearer ${kvToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`KV SET failed for ${key}: ${response.status}`);
  }
};

const kvIncrement = async (key) => {
  const response = await fetch(`${kvBaseUrl}/incr/${encodeURIComponent(key)}`, {
    headers: {
      Authorization: `Bearer ${kvToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`KV INCR failed for ${key}: ${response.status}`);
  }

  const payload = await response.json();
  return Number(payload.result);
};

const getKvMetrics = async () => {
  const [viewsRaw, updatedAtRaw] = await Promise.all([kvGet(kvViewsKey), kvGet(kvUpdatedAtKey)]);
  return {
    views: Number.isFinite(Number(viewsRaw)) ? Number(viewsRaw) : 0,
    updatedAt: typeof updatedAtRaw === "string" ? updatedAtRaw : null,
  };
};

const incrementKvMetrics = async () => {
  const nextViews = await kvIncrement(kvViewsKey);
  const updatedAt = new Date().toISOString();
  await kvSet(kvUpdatedAtKey, updatedAt);

  return {
    views: Number.isFinite(nextViews) ? nextViews : 0,
    updatedAt,
  };
};

const readMetrics = async () => {
  if (useMemoryFallback) {
    return memoryMetrics;
  }

  try {
    const fileBuffer = await fs.readFile(metricsFilePath, "utf8");
    const parsed = JSON.parse(fileBuffer);
    return {
      views: Number.isFinite(parsed.views) ? parsed.views : 0,
      updatedAt: parsed.updatedAt || null,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { views: 0, updatedAt: null };
    }

    useMemoryFallback = true;
    return memoryMetrics;
  }
};

const saveMetrics = async (metrics) => {
  memoryMetrics = metrics;

  if (useMemoryFallback) {
    return;
  }

  try {
    await fs.mkdir(metricsDir, { recursive: true });
    await fs.writeFile(metricsFilePath, JSON.stringify(metrics), "utf8");
  } catch (error) {
    console.error("Could not persist portfolio view metrics:", error);
    useMemoryFallback = true;
  }
};

const getViewStats = async () => {
  if (hasKvConfig) {
    try {
      const metrics = await getKvMetrics();
      memoryMetrics = metrics;
      return { ...metrics, storage: "kv" };
    } catch (error) {
      console.error("Could not read portfolio view metrics from KV:", error);
    }
  }

  const metrics = await readMetrics();
  memoryMetrics = metrics;
  return { ...metrics, storage: useMemoryFallback ? "memory" : "file" };
};

const incrementViewStats = async () => {
  if (hasKvConfig) {
    try {
      const metrics = await incrementKvMetrics();
      memoryMetrics = metrics;
      return { ...metrics, storage: "kv" };
    } catch (error) {
      console.error("Could not write portfolio view metrics to KV:", error);
    }
  }

  writeQueue = writeQueue.then(async () => {
    const current = await getViewStats();
    const next = {
      views: current.views + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveMetrics(next);
    return { ...next, storage: useMemoryFallback ? "memory" : "file" };
  });

  return writeQueue;
};

app.get("/api/views", async (_req, res) => {
  setNoStoreHeaders(res);
  const metrics = await getViewStats();
  res.json({
    totalViews: metrics.views,
    updatedAt: metrics.updatedAt,
    storage: metrics.storage,
  });
});

app.post("/api/views", async (_req, res) => {
  setNoStoreHeaders(res);
  const metrics = await incrementViewStats();
  res.json({
    totalViews: metrics.views,
    updatedAt: metrics.updatedAt,
    storage: metrics.storage,
  });
});

app.get("/api/blogs", async (req, res) => {
  setNoStoreHeaders(res);

  try {
    const result = await getCachedDevBlogs({
      page: req.query.page,
      perPage: req.query.per_page,
      fetchAll: req.query.all !== "0",
    });

    res.json({
      ...result.meta,
      count: result.blogs.length,
      blogs: result.blogs,
    });
  } catch (error) {
    console.error("Could not read DEV articles:", error);
    res.status(200).json({
      username: devUsername,
      source: "dev",
      authMode: devApiKey ? "api-key" : "public",
      count: 0,
      rawCount: 0,
      normalizedCount: 0,
      renderedCount: 0,
      fetchedAt: new Date().toISOString(),
      cache: "no-store",
      warning: "DEV articles are temporarily unavailable.",
      blogs: [],
    });
  }
});

app.get("/api/blogs/canonical-urls", async (_req, res) => {
  setNoStoreHeaders(res);

  try {
    const { blogs } = await getCachedDevBlogs();
    res.type("text/plain");
    res.send(renderCanonicalHelperText(blogs));
  } catch (error) {
    console.error("Could not generate DEV canonical helper output:", error);
    res.status(503).type("text/plain").send("Canonical helper output is temporarily unavailable.");
  }
});

app.get("/api/blogs/:slug", async (req, res) => {
  setNoStoreHeaders(res);

  try {
    const article = await getBlogArticleForSeo(req.params.slug);

    if (!article) {
      throw new Error("DEV article was not found.");
    }

    res.json({ ...article, bodyHtml: sanitizeDevArticleHtml(article.bodyHtml) });
  } catch (error) {
    console.error(`Could not read DEV article ${req.params.slug}:`, error);
    res.status(503).json({
      error: "This article is temporarily unavailable.",
    });
  }
});

app.get("/robots.txt", (_req, res) => {
  res.type("text/plain");
  res.send(`User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`);
});

app.get("/sitemap.xml", async (_req, res) => {
  let blogs = [];
  setNoStoreHeaders(res);

  try {
    blogs = (await getCachedDevBlogs()).blogs;
  } catch (error) {
    console.error("Could not read DEV articles for sitemap:", error);
  }

  res.type("application/xml");
  res.send(renderSitemapXml(blogs));
});

app.get("/feed.xml", async (_req, res) => {
  let blogs = [];
  setNoStoreHeaders(res);

  try {
    blogs = (await getCachedDevBlogs()).blogs;
  } catch (error) {
    console.error("Could not read DEV articles for feed:", error);
  }

  res.type("application/rss+xml");
  res.send(renderFeedXml(blogs));
});

app.use(
  express.static(path.join(__dirname, "public"), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      setNoStoreHeaders(res);
    },
  }),
);

app.get("/blog/:slug", async (req, res) => {
  setNoStoreHeaders(res);
  const article = await getBlogArticleForSeo(req.params.slug);

  if (!article) {
    return res.status(404).sendFile(path.join(__dirname, "public", "index.html"));
  }

  res.send(await renderBlogPage(article));
});

app.get("/aruvix", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "aruvix.html"));
});

app.get("/api/one", (req, res) => {
  console.log(req.query.name);

  if (req.query.name === undefined || req.query.name === "" || req.query.name === "null") {
    return res.status(400).json({
      error: {
        code: "TST1012",
        message: "Name query parameter is required.",
      },
    });
  }
  if (req.query.name === "forbidden") {
    return res.status(403).json({
      error: { code: "TST1013", message: "Access Forbidden for this name." },
    });
  }
  if (req.query.name === "notfound") {
    return res.status(404).json({ error: { code: "TST1014", message: "Name not found." } });
  }
  if (req.query.name === "servererror") {
    return res.status(500).json({ error: { code: "TST1015", message: "Internal server error." } });
  }
  if (req.query.name === "badrequest") {
    return res.status(400).json({
      error: { code: "TST1016", message: "Bad Request for this name." },
    });
  }
  if (req.query.name === "blank") {
    return res.status(200).json({});
  }
  if (req.query.name === "customobject") {
    return res.status(422).json({
      errors: [
        {
          code: "TST1010",
          title: "Custom object error.",
          message: "Invalid custom object",
        },
      ],
    });
  }

  if (req.query.name === "customobjectnested") {
    return res.status(422).json({
      errors: [
        [
          {
            code: "TST1010",
            title: "Custom object error.",
            message: "Invalid custom object",
          },
        ],
      ],
    });
  }
  res.json({
    message: "Hello from API One!",
    warning: [{ message: "This is a warning message from API One!" }],
  });
});

app.get("/api/two", (req, res) => {
  console.log(req.query.name);

  if (req.query.name === "null") {
    return res.status(400).json({
      error: {
        code: "TST1001",
        message: "Name query parameter is required.",
      },
    });
  }
  if (req.query.name === "forbidden") {
    return res.status(403).json({
      error: { code: "TST1002", message: "Access Forbidden for this name." },
    });
  }
  if (req.query.name === "notfound") {
    return res.status(404).json({ error: { code: "TST1003", message: "Name not found." } });
  }
  if (req.query.name === "servererror") {
    return res.status(500).json({ error: { code: "TST1004", message: "Internal server error." } });
  }
  if (req.query.name === "badrequest") {
    return res.status(400).json({
      error: { code: "TST1005", message: "Bad Request for this name." },
    });
  }
  if (req.query.name === "abc1") {
    return res.status(422).json({
      errors: [
        {
          code: "TST1006",
          title: "Custom object error.",
          message: "Invalid custom object",
        },
      ],
    });
  }
  res.json({
    message: "Hello from API One!",
    warning: [{ message: "This is a warning message from API One!" }],
  });
});

app.get("/api/one-journey", (req, res) => {
  res.json({
    data: {
      acceptance: {
        checkedInJourneyElements: [
          {
            id: "600795C5000382F4",
          },
        ],
        isAccepted: false,
        isPartial: true,
        isVoluntaryDeniedBoarding: false,
        notCheckedInJourneyElements: [
          {
            id: "600795C5000382F3",
          },
        ],
      },
      acceptanceEligibility: {
        eligibilityWindow: {
          closingDateAndTime: "2026-01-13T01:45:00+04:00",
          openingDateAndTime: "2026-01-11T20:45:00+04:00",
        },
        status: "eligible",
      },
      contacts: [
        {
          address: "AKJ@ETIHAD.AE",
          category: "personal",
          contactType: "Email",
          id: "610855C500031222_5fd04664",
          purpose: "notification",
          travelerIds: ["610855C500031222"],
        },
        {
          category: "personal",
          contactType: "Phone",
          countryPhoneExtension: "971",
          id: "610855C500031222_c772d13a",
          number: "583923222",
          purpose: "notification",
          travelerIds: ["610855C500031222"],
        },
        {
          address: "SVARMY@GMAIL.COM",
          category: "personal",
          contactType: "Email",
          id: "610855C5000312CE_35526d01",
          purpose: "notification",
          travelerIds: ["610855C5000312CE"],
        },
        {
          category: "personal",
          contactType: "Phone",
          countryPhoneExtension: "971",
          id: "610855C5000312CE_6b90a91c",
          number: "567800220",
          purpose: "notification",
          travelerIds: ["610855C5000312CE"],
        },
      ],
      flights: [
        {
          id: "EY-61-20260113",
        },
      ],
      id: "854F8E09C7348555C8580BCB97CD3FECA38197751768372544",
      isGroupBooking: false,
      journeyElements: [
        {
          id: "600795C5000382F4",
        },
        {
          id: "600795C5000382F3",
        },
      ],
      travelers: [
        {
          dateOfBirth: "1986-12-30",
          gender: "male",
          id: "610855C500031222",
          isPilgrimConfirmationProvided: false,
          names: [
            {
              firstName: "GAY",
              lastName: "BAYER",
              nameType: "universal",
              title: "LORD",
            },
          ],
          passengerTypeCode: "ADT",
        },
        {
          dateOfBirth: "2014-02-12",
          gender: "male",
          id: "610855C5000312CE",
          isPilgrimConfirmationProvided: false,
          names: [
            {
              firstName: "SILAS",
              lastName: "BAYER",
              nameType: "universal",
              title: "",
            },
          ],
          passengerTypeCode: "CHD",
        },
      ],
      type: "standalone",
    },
    dictionaries: {
      aircraft: {
        388: "AIRBUS A380-800",
      },
      airline: {
        EY: "ETIHAD AIRWAYS",
      },
      country: {
        AE: "UNITED ARAB EMIRATES",
        GB: "UNITED KINGDOM",
      },
      flight: {
        "EY-61-20260113": {
          acceptanceStatus: "opened",
          aircraftCode: "388",
          arrival: {
            dateTime: "2026-01-13T06:40:00+00:00",
            locationCode: "LHR",
            terminal: "4",
          },
          departure: {
            dateTime: "2026-01-13T02:45:00+04:00",
            locationCode: "AUH",
            terminal: "A",
          },
          duration: 28500,
          id: "EY-61-20260113",
          isIATCI: false,
          isPilgrimConfirmationRequired: false,
          marketingAirlineCode: "EY",
          marketingFlightNumber: "61",
          operatingAirlineCode: "EY",
          operatingAirlineFlightNumber: "61",
          operatingAirlineName: "ETIHAD AIRWAYS",
          operatingFlightNumber: "61",
          status: "scheduled",
        },
      },
      journeyElement: {
        "600795C5000382F3": {
          acceptanceEligibility: {
            eligibilityWindow: {
              closingDateAndTime: "2026-01-13T01:45:00+04:00",
              openingDateAndTime: "2026-01-11T20:45:00+04:00",
            },
            status: "eligible",
          },
          boardingPassEligibility: {
            reasons: ["passengerNotAccepted"],
            status: "ineligible",
          },
          boardingPassPrintStatus: "notPrinted",
          boardingStatus: "notBoarded",
          cabin: "J",
          checkInStatus: "notAccepted",
          fareFamily: {
            code: "EY-JCOMFORT",
          },
          flightId: "EY-61-20260113",
          id: "600795C5000382F3",
          orderId: "7OHQUF",
          regulatoryProgramsCheckStatuses: [
            {
              isOverallSuccess: true,
              regulatoryProgram: {
                countryCode: "GBR",
              },
              statuses: [
                {
                  humanReadableDescription: "OK to Board",
                  isSuccessful: true,
                  statusCode: "0",
                  statusType: "SECURITY",
                },
                {
                  humanReadableDescription: "Manual Check For Visa Nationals",
                  isSuccessful: true,
                  statusCode: "Z",
                  statusType: "IMMIGRATION",
                },
              ],
            },
            {
              regulatoryProgram: {
                name: "ADC",
              },
              statuses: [
                {
                  statusCode: "O",
                },
              ],
            },
          ],
          seatmapEligibility: {
            status: "eligible",
          },
          travelerId: "610855C5000312CE",
        },
        "600795C5000382F4": {
          acceptanceEligibility: {
            eligibilityWindow: {
              closingDateAndTime: "2026-01-13T01:45:00+04:00",
              openingDateAndTime: "2026-01-11T20:45:00+04:00",
            },
            status: "eligible",
          },
          boardingPassEligibility: {
            status: "eligible",
          },
          boardingPassPrintStatus: "printed",
          boardingStatus: "notBoarded",
          cabin: "J",
          checkInStatus: "accepted",
          fareFamily: {
            code: "EY-JCOMFORT",
          },
          flightId: "EY-61-20260113",
          id: "600795C5000382F4",
          orderId: "7OHQUF",
          regulatoryProgramsCheckStatuses: [
            {
              isOverallSuccess: true,
              regulatoryProgram: {
                countryCode: "ARE",
              },
              statuses: [
                {
                  humanReadableDescription: "OK to Board if documents are OK",
                  isSuccessful: true,
                  statusCode: "",
                  statusType: "SECURITY",
                },
              ],
            },
            {
              isOverallSuccess: true,
              regulatoryProgram: {
                countryCode: "GBR",
              },
              statuses: [
                {
                  humanReadableDescription: "OK to Board",
                  isSuccessful: true,
                  statusCode: "0",
                  statusType: "SECURITY",
                },
                {
                  humanReadableDescription: "Manual Check For Visa Nationals",
                  isSuccessful: true,
                  statusCode: "Z",
                  statusType: "IMMIGRATION",
                },
              ],
            },
            {
              regulatoryProgram: {
                name: "ADC",
              },
              statuses: [
                {
                  statusCode: "O",
                },
              ],
            },
          ],
          seat: {
            cabin: "J",
            isInfantAloneOnSeat: false,
            isInfantOnSeat: false,
            seatAvailabilityStatus: "occupied",
            seatCharacteristicsCodes: ["9", "BC", "N", "UP"],
            seatNumber: "22F",
          },
          seatmapEligibility: {
            status: "eligible",
          },
          travelerId: "610855C500031222",
        },
      },
      location: {
        AUH: {
          airportName: "ABU DHABI ZAYED INTERNATION",
          cityCode: "AUH",
          cityName: "ABU DHABI",
          countryCode: "AE",
          stateCode: "",
          type: "airport",
        },
        LHR: {
          airportName: "LONDON HEATHROW",
          cityCode: "LON",
          cityName: "LONDON",
          countryCode: "GB",
          stateCode: "",
          type: "airport",
        },
      },
      traveler: {
        "610855C500031222": {
          dateOfBirth: "1986-12-30",
          gender: "male",
          id: "610855C500031222",
          isPilgrimConfirmationProvided: false,
          names: [
            {
              firstName: "GAY",
              lastName: "BAYER",
              nameType: "universal",
              title: "LORD",
            },
          ],
          passengerTypeCode: "ADT",
        },
        "610855C5000312CE": {
          dateOfBirth: "2014-02-12",
          gender: "male",
          id: "610855C5000312CE",
          isPilgrimConfirmationProvided: false,
          names: [
            {
              firstName: "SILAS",
              lastName: "BAYER",
              nameType: "universal",
              title: "",
            },
          ],
          passengerTypeCode: "CHD",
        },
      },
    },
  });
});

app.post("/api/one", (req, res) => {
  if (req.query.name === "null") {
    return res.status(400).json({
      error: {
        code: "TST1001",
        message: "Name query parameter is required.",
      },
    });
  }
  if (req.query.name === "forbidden") {
    return res.status(403).json({
      error: { code: "TST1002", message: "Access Forbidden for this name." },
    });
  }
  if (req.query.name === "notfound") {
    return res.status(404).json({ error: { code: "TST1003", message: "Name not found." } });
  }
  if (req.query.name === "servererror") {
    return res.status(500).json({ error: { code: "TST1004", message: "Internal server error." } });
  }
  if (req.query.name === "badrequest") {
    return res.status(400).json({
      error: { code: "TST1005", message: "Bad Request for this name." },
    });
  } else {
    return res.json({
      type: "amadeusOAuth2Token",
      username: "GuiQHWUFVsdoCulnjnScqNp0046Fe7rbqesJrrhXwk@pkCxWvL21e3YJbycvvgBcKwrVRGQS5qhnsfItA2elY.com",
      application_name: "9WRw9aPX06cMDGzAveyWywFtLHkHHTMJ2IhQr2x4E",
      client_id: "GYWAAGQgQaPdZvSla8HDexJnzrkLBq2b",
      token_type: "Bearer",
      access_token: "CMfRelgV6ShxU83nvGaeyMUAmMQd",
      expires_in: 1799,
      state: "approved",
      scope: "",
      guest_office_id: "",
    });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
    console.log(`DEV API key: ${devApiKey ? "configured" : "NOT set — unauthenticated requests may be cached by DEV.to CDN"}`);
  });
}

module.exports = app;
