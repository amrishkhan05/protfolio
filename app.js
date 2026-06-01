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
const devApiHeaders = {
  Accept: "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  "User-Agent": "amrishkhan.dev portfolio",
  "Accept-Encoding": "identity",
  ...(devApiKey ? { "api-key": devApiKey } : {}),
};
const siteUrl = "https://amrishkhan.dev";
const siteImageUrl = `${siteUrl}/favicon.svg`;
const personId = `${siteUrl}/#person`;

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

app.use(
  express.static(path.join(__dirname, "public"), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      setNoStoreHeaders(res);
    },
  }),
);

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

const normalizeDevArticle = (article) => {
  if (!isRecord(article)) {
    return null;
  }

  const title = article?.title || "Untitled article";
  const devSlug = article?.slug || slugify(title);
  const publishedAt = toValidDateTime(article?.published_at || article?.published_timestamp || article?.created_at || null);
  const tags =
    Array.isArray(article?.tag_list) && article.tag_list.length
      ? article.tag_list
      : typeof article?.tags === "string" && article.tags.trim()
        ? article.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [];

  return {
    id: article?.id || `${devSlug}:${publishedAt || title}`,
    title,
    localSlug: slugify(title),
    devSlug,
    description: article?.description || "",
    publishedAt,
    tags,
    readingTimeMinutes: article?.reading_time_minutes || null,
    coverImage: article?.cover_image || article?.social_image || null,
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
      cache: "no-store",
    },
  };
};

const escapeHtml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const escapeXml = escapeHtml;

const escapeJsonForHtml = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

const absoluteUrl = (pathname = "/") => new URL(pathname, siteUrl).toString();

const buildSeoTags = ({ title, description, canonicalPath, type = "website", image = siteImageUrl, jsonLd }) => {
  const canonicalUrl = absoluteUrl(canonicalPath);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCanonicalUrl = escapeHtml(canonicalUrl);
  const safeType = escapeHtml(type);
  const safeImage = escapeHtml(image);
  const jsonLdTag = jsonLd ? `    <script type="application/ld+json">${escapeJsonForHtml(jsonLd)}</script>\n` : "";

  return `    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}" />
    <meta name="author" content="Amrishkhan Sheik Abdullah" />
    <link rel="canonical" href="${safeCanonicalUrl}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:url" content="${safeCanonicalUrl}" />
    <meta property="og:type" content="${safeType}" />
    <meta property="og:image" content="${safeImage}" />
    <meta name="twitter:card" content="summary" />
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
  name: "Amrishkhan Sheik Abdullah",
  url: `${siteUrl}/`,
  jobTitle: "Technical Lead and Full Stack Engineer",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Dubai",
    addressCountry: "AE",
  },
  sameAs: ["https://www.linkedin.com/in/amrishkhan", "https://github.com/amrishkhan05", "https://www.npmjs.com/package/sql-select-query-generator"],
  knowsAbout: ["Angular", "React", "Vue.js", "Node.js", "NestJS", "Microservices", "API design", "Payment integrations"],
});

const getBlogArticleForSeo = async (slug) => {
  try {
    const { blogs } = await fetchMappedDevBlogs();
    return blogs.find((article) => article.localSlug === slug || article.devSlug === slug) || null;
  } catch (error) {
    console.error(`Could not read DEV article SEO data for ${slug}:`, error);
    return null;
  }
};

const renderBlogPage = async (article) => {
  const indexHtml = await fs.readFile(path.join(__dirname, "public", "index.html"), "utf8");
  const canonicalPath = article.url;
  const description = article.description || `Read ${article.title} by Amrishkhan Sheik Abdullah on amrishkhan.dev.`;
  const image = article.coverImage || siteImageUrl;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description,
    url: absoluteUrl(canonicalPath),
    image,
    datePublished: article.publishedAt,
    dateModified: article.publishedAt,
    author: {
      "@type": "Person",
      "@id": personId,
      name: "Amrishkhan Sheik Abdullah",
      url: `${siteUrl}/`,
    },
    publisher: getPersonJsonLd(),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": absoluteUrl(canonicalPath),
    },
    keywords: Array.isArray(article.tags) ? article.tags.join(", ") : "",
  };

  return replaceSeoHead(
    indexHtml,
    buildSeoTags({
      title: `${article.title} | amrishkhan.dev`,
      description,
      canonicalPath,
      type: "article",
      image,
      jsonLd,
    }),
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
    const result = await fetchMappedDevBlogs({
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

app.get("/api/blogs/:slug", async (req, res) => {
  setNoStoreHeaders(res);

  try {
    const article = await fetchDevJson(buildFreshDevUrl(`/articles/${encodeURIComponent(devUsername)}/${encodeURIComponent(req.params.slug)}`));

    if (!isRecord(article)) {
      throw new Error("DEV API returned a malformed article payload.");
    }

    const mappedArticle = normalizeDevArticle(article);

    if (!mappedArticle) {
      throw new Error("DEV API returned an article that could not be normalized.");
    }

    res.json({
      ...mappedArticle,
      description: article.description || mappedArticle.description,
      publishedAt: article.published_at || article.published_timestamp || mappedArticle.publishedAt,
      tags: Array.isArray(article.tag_list) && article.tag_list.length ? article.tag_list : mappedArticle.tags,
      coverImage: article.cover_image || article.social_image || mappedArticle.coverImage,
      bodyHtml: article.body_html || "",
      bodyMarkdown: article.body_markdown || "",
      source: "dev",
    });
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
    blogs = (await fetchMappedDevBlogs()).blogs;
  } catch (error) {
    console.error("Could not read DEV articles for sitemap:", error);
  }

  const urls = [
    { loc: `${siteUrl}/`, priority: "1.0" },
    { loc: `${siteUrl}/aruvix`, priority: "0.9" },
    ...blogs.map((blog) => ({
      loc: absoluteUrl(blog.url),
      lastmod: blog.publishedAt,
      priority: "0.7",
    })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((url) => {
    const lastmod = url.lastmod ? `\n    <lastmod>${escapeXml(url.lastmod.slice(0, 10))}</lastmod>` : "";

    return `  <url>
    <loc>${escapeXml(url.loc)}</loc>${lastmod}
    <priority>${escapeXml(url.priority)}</priority>
  </url>`;
  })
  .join("\n")}
</urlset>
`;

  res.type("application/xml");
  res.send(xml);
});

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
