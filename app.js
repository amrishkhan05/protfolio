/** @format */

const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const app = express();
const port = process.env.PORT || 3333;
const hasKvConfig = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
);
const kvBaseUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;
const kvViewsKey = 'amrishkhan.dev:portfolio:views';
const kvUpdatedAtKey = 'amrishkhan.dev:portfolio:updatedAt';
const devUsername = process.env.DEV_USERNAME || 'amrishkhan05';
const devApiBaseUrl = 'https://dev.to/api';
const devApiHeaders = {
  Accept: 'application/json',
  'User-Agent': 'amrishkhan.dev portfolio',
};
const siteUrl = 'https://amrishkhan.dev';
const siteImageUrl = `${siteUrl}/favicon.svg`;
const personId = `${siteUrl}/#person`;
const mappedBlogPosts = [
  {
    title: "Unlocking the Power of the Browser Console: A Developer's Guide",
    devSlug: 'unlocking-the-power-of-the-browser-console-a-developers-guide-4n7k',
    description:
      'A practical guide to using the browser console for debugging, inspection, and faster frontend development.',
    publishedAt: '2025-10-17T00:00:00Z',
    tags: ['Debugging', 'Browser Tools'],
  },
  {
    title:
      'Demystifying SOLID: 5 Principles for Building Robust and Maintainable Software',
    devSlug:
      'demystifying-solid-5-principles-for-building-robust-and-maintainable-software-2c9j',
    description:
      'A clear breakdown of SOLID principles for building maintainable, robust software systems.',
    publishedAt: '2025-10-14T00:00:00Z',
    tags: ['Architecture', 'Clean Code'],
  },
  {
    title:
      'GitHub Code Setup: Choosing Your Workflow (HTTPS, SSH, Terminal, and Desktop)',
    devSlug:
      'github-code-setup-choosing-your-workflow-https-ssh-terminal-desktop-7op',
    description:
      'A developer guide to choosing a GitHub setup workflow across HTTPS, SSH, terminal, and GitHub Desktop.',
    publishedAt: '2025-10-08T00:00:00Z',
    tags: ['GitHub', 'Developer Setup'],
  },
  {
    title: 'Level Up Your Workflow: Mastering Bulk Actions in Postman',
    devSlug: 'level-up-your-workflow-mastering-bulk-actions-in-postman-2489',
    description:
      'A focused Postman workflow guide for using bulk actions to speed up API testing and development.',
    publishedAt: '2025-10-08T00:00:00Z',
    tags: ['Postman', 'Productivity'],
  },
  {
    title:
      'Unraveling the JavaScript Event Loop: A Deep Dive for Developers',
    devSlug: 'unraveling-the-javascript-event-loop-a-deep-dive-for-developers-50fg',
    description:
      'A developer-focused explanation of the JavaScript event loop, async behavior, and runtime execution.',
    publishedAt: '2025-10-07T00:00:00Z',
    tags: ['JavaScript', 'Runtime Internals'],
  },
  {
    title:
      "A Developer's Guide to API Types: Architectures, Use Cases, and Code Examples",
    devSlug:
      'a-developers-guide-to-api-types-architectures-use-cases-and-code-examples-3kbm',
    description:
      'A practical guide to API types, architecture choices, common use cases, and implementation examples.',
    publishedAt: '2025-10-06T00:00:00Z',
    tags: ['APIs', 'System Design'],
  },
  {
    title:
      "npm vs. Yarn vs. pnpm: A Developer's Guide to Choosing the Right Package Manager",
    devSlug:
      'npm-vs-yarn-vs-pnpm-a-developers-guide-to-choosing-the-right-package-manager-285f',
    description:
      'A comparison of npm, Yarn, and pnpm to help developers choose the right JavaScript package manager.',
    publishedAt: '2025-10-06T00:00:00Z',
    tags: ['Package Management', 'Node.js'],
  },
  {
    title:
      'The Postman Alternative Guide: Which API Client is Right for You in 2025?',
    devSlug:
      'the-postman-alternative-guide-which-api-client-is-right-for-you-in-2025-2p0b',
    description:
      'A 2025 guide to Postman alternatives and API clients for different developer workflows.',
    publishedAt: '2025-10-06T00:00:00Z',
    tags: ['API Tooling', 'Developer Experience'],
  },
];

const metricsDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'amrishkhan-dev-metrics')
  : path.join(__dirname, '.data');
const metricsFilePath = path.join(metricsDir, 'portfolio-views.json');
let memoryMetrics = { views: 0, updatedAt: null };
let useMemoryFallback = false;
let writeQueue = Promise.resolve();

app.use(express.static(path.join(__dirname, 'public')));

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeTitle = (value) =>
  String(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeDevArticle = (article, fallback) => {
  const title = article?.title || fallback.title;
  const devSlug = article?.slug || fallback.devSlug || null;
  const publishedAt =
    article?.published_at || article?.published_timestamp || fallback.publishedAt;
  const tags =
    Array.isArray(article?.tag_list) && article.tag_list.length
      ? article.tag_list
      : fallback.tags;

  return {
    title,
    localSlug: slugify(fallback.title),
    devSlug,
    description: article?.description || fallback.description || '',
    publishedAt,
    tags,
    readingTimeMinutes: article?.reading_time_minutes || null,
    coverImage: article?.cover_image || article?.social_image || null,
    url: `/blog/${devSlug || slugify(fallback.title)}`,
    devUrl: article?.url || null,
    source: article ? 'dev' : 'fallback',
  };
};

const getMappedFallbackBlogs = () =>
  mappedBlogPosts.map((post) => normalizeDevArticle(null, post));

const fetchDevJson = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(url, {
      headers: devApiHeaders,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`DEV API request failed: ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const fetchMappedDevBlogs = async () => {
  const url = `${devApiBaseUrl}/articles?username=${encodeURIComponent(
    devUsername,
  )}&per_page=100`;
  const articles = await fetchDevJson(url);

  if (!Array.isArray(articles)) {
    throw new Error('DEV API returned an invalid article list.');
  }

  const articlesByTitle = new Map(
    articles.map((article) => [normalizeTitle(article.title), article]),
  );

  return mappedBlogPosts.map((post) =>
    normalizeDevArticle(articlesByTitle.get(normalizeTitle(post.title)), post),
  );
};

const findMappedBlog = (slug) =>
  mappedBlogPosts.find(
    (post) => slugify(post.title) === slug || post.devSlug === slug,
  );

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeXml = escapeHtml;

const escapeJsonForHtml = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c');

const absoluteUrl = (pathname = '/') =>
  new URL(pathname, siteUrl).toString();

const buildSeoTags = ({
  title,
  description,
  canonicalPath,
  type = 'website',
  image = siteImageUrl,
  jsonLd,
}) => {
  const canonicalUrl = absoluteUrl(canonicalPath);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCanonicalUrl = escapeHtml(canonicalUrl);
  const safeType = escapeHtml(type);
  const safeImage = escapeHtml(image);
  const jsonLdTag = jsonLd
    ? `    <script type="application/ld+json">${escapeJsonForHtml(jsonLd)}</script>\n`
    : '';

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
    .replace(/\s*<title>[\s\S]*?<\/title>/i, '')
    .replace(/\s*<meta\s+name="description"[\s\S]*?>/gi, '')
    .replace(/\s*<meta\s+name="author"[\s\S]*?>/gi, '')
    .replace(/\s*<link\s+rel="canonical"[\s\S]*?>/gi, '')
    .replace(/\s*<meta\s+property="og:[\s\S]*?>/gi, '')
    .replace(/\s*<meta\s+name="twitter:[\s\S]*?>/gi, '')
    .replace(
      /\s*<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi,
      '',
    );

  return withoutStaticSeo.replace(
    /(<meta name="color-scheme" content="light dark" \/>\n)/,
    `$1${seoTags}`,
  );
};

const getPersonJsonLd = () => ({
  '@type': 'Person',
  '@id': personId,
  name: 'Amrishkhan Sheik Abdullah',
  url: `${siteUrl}/`,
  jobTitle: 'Technical Lead and Full Stack Engineer',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Dubai',
    addressCountry: 'AE',
  },
  sameAs: [
    'https://www.linkedin.com/in/amrishkhan',
    'https://github.com/amrishkhan05',
    'https://www.npmjs.com/package/sql-select-query-generator',
  ],
  knowsAbout: [
    'Angular',
    'React',
    'Vue.js',
    'Node.js',
    'NestJS',
    'Microservices',
    'API design',
    'Payment integrations',
  ],
});

const getBlogArticleForSeo = async (slug) => {
  const fallback = findMappedBlog(slug);

  if (!fallback) {
    return null;
  }

  try {
    const blogs = await fetchMappedDevBlogs();
    return blogs.find(
      (article) => article.localSlug === slug || article.devSlug === slug,
    ) || normalizeDevArticle(null, fallback);
  } catch (error) {
    console.error(`Could not read DEV article SEO data for ${slug}:`, error);
    return normalizeDevArticle(null, fallback);
  }
};

const renderBlogPage = async (article) => {
  const indexHtml = await fs.readFile(
    path.join(__dirname, 'public', 'index.html'),
    'utf8',
  );
  const canonicalPath = article.url;
  const description =
    article.description ||
    `Read ${article.title} by Amrishkhan Sheik Abdullah on amrishkhan.dev.`;
  const image = article.coverImage || siteImageUrl;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description,
    url: absoluteUrl(canonicalPath),
    image,
    datePublished: article.publishedAt,
    dateModified: article.publishedAt,
    author: {
      '@type': 'Person',
      '@id': personId,
      name: 'Amrishkhan Sheik Abdullah',
      url: `${siteUrl}/`,
    },
    publisher: getPersonJsonLd(),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': absoluteUrl(canonicalPath),
    },
    keywords: Array.isArray(article.tags) ? article.tags.join(', ') : '',
  };

  return replaceSeoHead(
    indexHtml,
    buildSeoTags({
      title: `${article.title} | amrishkhan.dev`,
      description,
      canonicalPath,
      type: 'article',
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
  const response = await fetch(
    `${kvBaseUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`,
    {
      headers: {
        Authorization: `Bearer ${kvToken}`,
      },
    },
  );

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
  const [viewsRaw, updatedAtRaw] = await Promise.all([
    kvGet(kvViewsKey),
    kvGet(kvUpdatedAtKey),
  ]);
  return {
    views: Number.isFinite(Number(viewsRaw)) ? Number(viewsRaw) : 0,
    updatedAt: typeof updatedAtRaw === 'string' ? updatedAtRaw : null,
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
    const fileBuffer = await fs.readFile(metricsFilePath, 'utf8');
    const parsed = JSON.parse(fileBuffer);
    return {
      views: Number.isFinite(parsed.views) ? parsed.views : 0,
      updatedAt: parsed.updatedAt || null,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
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
    await fs.writeFile(metricsFilePath, JSON.stringify(metrics), 'utf8');
  } catch (error) {
    console.error('Could not persist portfolio view metrics:', error);
    useMemoryFallback = true;
  }
};

const getViewStats = async () => {
  if (hasKvConfig) {
    try {
      const metrics = await getKvMetrics();
      memoryMetrics = metrics;
      return { ...metrics, storage: 'kv' };
    } catch (error) {
      console.error('Could not read portfolio view metrics from KV:', error);
    }
  }

  const metrics = await readMetrics();
  memoryMetrics = metrics;
  return { ...metrics, storage: useMemoryFallback ? 'memory' : 'file' };
};

const incrementViewStats = async () => {
  if (hasKvConfig) {
    try {
      const metrics = await incrementKvMetrics();
      memoryMetrics = metrics;
      return { ...metrics, storage: 'kv' };
    } catch (error) {
      console.error('Could not write portfolio view metrics to KV:', error);
    }
  }

  writeQueue = writeQueue.then(async () => {
    const current = await getViewStats();
    const next = {
      views: current.views + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveMetrics(next);
    return { ...next, storage: useMemoryFallback ? 'memory' : 'file' };
  });

  return writeQueue;
};

app.get('/api/views', async (_req, res) => {
  res.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  );
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  const metrics = await getViewStats();
  res.json({
    totalViews: metrics.views,
    updatedAt: metrics.updatedAt,
    storage: metrics.storage,
  });
});

app.post('/api/views', async (_req, res) => {
  res.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  );
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  const metrics = await incrementViewStats();
  res.json({
    totalViews: metrics.views,
    updatedAt: metrics.updatedAt,
    storage: metrics.storage,
  });
});

app.get('/api/blogs', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');

  try {
    const blogs = await fetchMappedDevBlogs();
    res.json({ username: devUsername, source: 'dev', blogs });
  } catch (error) {
    console.error('Could not read DEV articles:', error);
    res.status(200).json({
      username: devUsername,
      source: 'fallback',
      warning: 'DEV articles are temporarily unavailable.',
      blogs: getMappedFallbackBlogs(),
    });
  }
});

app.get('/api/blogs/:slug', async (req, res) => {
  const fallback = findMappedBlog(req.params.slug);

  if (!fallback) {
    return res.status(404).json({ error: 'Blog post not found.' });
  }

  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');

  try {
    const blogs = await fetchMappedDevBlogs();
    const mappedArticle = blogs.find(
      (article) =>
        article.localSlug === req.params.slug ||
        article.devSlug === req.params.slug,
    );

    if (!mappedArticle?.devSlug) {
      return res.status(200).json({
        ...normalizeDevArticle(null, fallback),
        bodyHtml: '',
        bodyMarkdown: '',
        unavailable: true,
        message: 'This article is not available from DEV yet.',
      });
    }

    const article = await fetchDevJson(
      `${devApiBaseUrl}/articles/${encodeURIComponent(
        devUsername,
      )}/${encodeURIComponent(mappedArticle.devSlug)}`,
    );

    res.json({
      ...mappedArticle,
      description: article.description || mappedArticle.description,
      publishedAt:
        article.published_at ||
        article.published_timestamp ||
        mappedArticle.publishedAt,
      tags:
        Array.isArray(article.tag_list) && article.tag_list.length
          ? article.tag_list
          : mappedArticle.tags,
      coverImage:
        article.cover_image || article.social_image || mappedArticle.coverImage,
      bodyHtml: article.body_html || '',
      bodyMarkdown: article.body_markdown || '',
      source: 'dev',
    });
  } catch (error) {
    console.error(`Could not read DEV article ${req.params.slug}:`, error);
    res.status(200).json({
      ...normalizeDevArticle(null, fallback),
      bodyHtml: '',
      bodyMarkdown: '',
      unavailable: true,
      message: 'This article is temporarily unavailable.',
    });
  }
});

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`);
});

app.get('/sitemap.xml', (_req, res) => {
  const urls = [
    { loc: `${siteUrl}/`, priority: '1.0' },
    { loc: `${siteUrl}/aruvix`, priority: '0.9' },
    ...getMappedFallbackBlogs().map((blog) => ({
      loc: absoluteUrl(blog.url),
      lastmod: blog.publishedAt,
      priority: '0.7',
    })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((url) => {
    const lastmod = url.lastmod
      ? `\n    <lastmod>${escapeXml(url.lastmod.slice(0, 10))}</lastmod>`
      : '';

    return `  <url>
    <loc>${escapeXml(url.loc)}</loc>${lastmod}
    <priority>${escapeXml(url.priority)}</priority>
  </url>`;
  })
  .join('\n')}
</urlset>
`;

  res.type('application/xml');
  res.send(xml);
});

app.get('/blog/:slug', async (req, res) => {
  const article = await getBlogArticleForSeo(req.params.slug);

  if (!article) {
    return res
      .status(404)
      .sendFile(path.join(__dirname, 'public', 'index.html'));
  }

  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');
  res.send(await renderBlogPage(article));
});

app.get('/aruvix', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'aruvix.html'));
});

app.get('/api/one', (req, res) => {
  console.log(req.query.name);

  if (
    req.query.name === undefined ||
    req.query.name === '' ||
    req.query.name === 'null'
  ) {
    return res
      .status(400)
      .json({
        error: {
          code: 'TST1012',
          message: 'Name query parameter is required.',
        },
      });
  }
  if (req.query.name === 'forbidden') {
    return res
      .status(403)
      .json({
        error: { code: 'TST1013', message: 'Access Forbidden for this name.' },
      });
  }
  if (req.query.name === 'notfound') {
    return res
      .status(404)
      .json({ error: { code: 'TST1014', message: 'Name not found.' } });
  }
  if (req.query.name === 'servererror') {
    return res
      .status(500)
      .json({ error: { code: 'TST1015', message: 'Internal server error.' } });
  }
  if (req.query.name === 'badrequest') {
    return res
      .status(400)
      .json({
        error: { code: 'TST1016', message: 'Bad Request for this name.' },
      });
  }
  if (req.query.name === 'blank') {
    return res.status(200).json({});
  }
  if (req.query.name === 'customobject') {
    return res.status(422).json({
      errors: [
        {
          code: 'TST1010',
          title: 'Custom object error.',
          message: 'Invalid custom object',
        },
      ],
    });
  }

  if (req.query.name === 'customobjectnested') {
    return res.status(422).json({
      errors: [
        [
          {
            code: 'TST1010',
            title: 'Custom object error.',
            message: 'Invalid custom object',
          },
        ],
      ],
    });
  }
  res.json({
    message: 'Hello from API One!',
    warning: [{ message: 'This is a warning message from API One!' }],
  });
});

app.get('/api/two', (req, res) => {
  console.log(req.query.name);

  if (req.query.name === 'null') {
    return res
      .status(400)
      .json({
        error: {
          code: 'TST1001',
          message: 'Name query parameter is required.',
        },
      });
  }
  if (req.query.name === 'forbidden') {
    return res
      .status(403)
      .json({
        error: { code: 'TST1002', message: 'Access Forbidden for this name.' },
      });
  }
  if (req.query.name === 'notfound') {
    return res
      .status(404)
      .json({ error: { code: 'TST1003', message: 'Name not found.' } });
  }
  if (req.query.name === 'servererror') {
    return res
      .status(500)
      .json({ error: { code: 'TST1004', message: 'Internal server error.' } });
  }
  if (req.query.name === 'badrequest') {
    return res
      .status(400)
      .json({
        error: { code: 'TST1005', message: 'Bad Request for this name.' },
      });
  }
  if (req.query.name === 'abc1') {
    return res.status(422).json({
      errors: [
        {
          code: 'TST1006',
          title: 'Custom object error.',
          message: 'Invalid custom object',
        },
      ],
    });
  }
  res.json({
    message: 'Hello from API One!',
    warning: [{ message: 'This is a warning message from API One!' }],
  });
});

app.get('/api/one-journey', (req, res) => {
  res.json({
    data: {
      acceptance: {
        checkedInJourneyElements: [
          {
            id: '600795C5000382F4',
          },
        ],
        isAccepted: false,
        isPartial: true,
        isVoluntaryDeniedBoarding: false,
        notCheckedInJourneyElements: [
          {
            id: '600795C5000382F3',
          },
        ],
      },
      acceptanceEligibility: {
        eligibilityWindow: {
          closingDateAndTime: '2026-01-13T01:45:00+04:00',
          openingDateAndTime: '2026-01-11T20:45:00+04:00',
        },
        status: 'eligible',
      },
      contacts: [
        {
          address: 'AKJ@ETIHAD.AE',
          category: 'personal',
          contactType: 'Email',
          id: '610855C500031222_5fd04664',
          purpose: 'notification',
          travelerIds: ['610855C500031222'],
        },
        {
          category: 'personal',
          contactType: 'Phone',
          countryPhoneExtension: '971',
          id: '610855C500031222_c772d13a',
          number: '583923222',
          purpose: 'notification',
          travelerIds: ['610855C500031222'],
        },
        {
          address: 'SVARMY@GMAIL.COM',
          category: 'personal',
          contactType: 'Email',
          id: '610855C5000312CE_35526d01',
          purpose: 'notification',
          travelerIds: ['610855C5000312CE'],
        },
        {
          category: 'personal',
          contactType: 'Phone',
          countryPhoneExtension: '971',
          id: '610855C5000312CE_6b90a91c',
          number: '567800220',
          purpose: 'notification',
          travelerIds: ['610855C5000312CE'],
        },
      ],
      flights: [
        {
          id: 'EY-61-20260113',
        },
      ],
      id: '854F8E09C7348555C8580BCB97CD3FECA38197751768372544',
      isGroupBooking: false,
      journeyElements: [
        {
          id: '600795C5000382F4',
        },
        {
          id: '600795C5000382F3',
        },
      ],
      travelers: [
        {
          dateOfBirth: '1986-12-30',
          gender: 'male',
          id: '610855C500031222',
          isPilgrimConfirmationProvided: false,
          names: [
            {
              firstName: 'GAY',
              lastName: 'BAYER',
              nameType: 'universal',
              title: 'LORD',
            },
          ],
          passengerTypeCode: 'ADT',
        },
        {
          dateOfBirth: '2014-02-12',
          gender: 'male',
          id: '610855C5000312CE',
          isPilgrimConfirmationProvided: false,
          names: [
            {
              firstName: 'SILAS',
              lastName: 'BAYER',
              nameType: 'universal',
              title: '',
            },
          ],
          passengerTypeCode: 'CHD',
        },
      ],
      type: 'standalone',
    },
    dictionaries: {
      aircraft: {
        388: 'AIRBUS A380-800',
      },
      airline: {
        EY: 'ETIHAD AIRWAYS',
      },
      country: {
        AE: 'UNITED ARAB EMIRATES',
        GB: 'UNITED KINGDOM',
      },
      flight: {
        'EY-61-20260113': {
          acceptanceStatus: 'opened',
          aircraftCode: '388',
          arrival: {
            dateTime: '2026-01-13T06:40:00+00:00',
            locationCode: 'LHR',
            terminal: '4',
          },
          departure: {
            dateTime: '2026-01-13T02:45:00+04:00',
            locationCode: 'AUH',
            terminal: 'A',
          },
          duration: 28500,
          id: 'EY-61-20260113',
          isIATCI: false,
          isPilgrimConfirmationRequired: false,
          marketingAirlineCode: 'EY',
          marketingFlightNumber: '61',
          operatingAirlineCode: 'EY',
          operatingAirlineFlightNumber: '61',
          operatingAirlineName: 'ETIHAD AIRWAYS',
          operatingFlightNumber: '61',
          status: 'scheduled',
        },
      },
      journeyElement: {
        '600795C5000382F3': {
          acceptanceEligibility: {
            eligibilityWindow: {
              closingDateAndTime: '2026-01-13T01:45:00+04:00',
              openingDateAndTime: '2026-01-11T20:45:00+04:00',
            },
            status: 'eligible',
          },
          boardingPassEligibility: {
            reasons: ['passengerNotAccepted'],
            status: 'ineligible',
          },
          boardingPassPrintStatus: 'notPrinted',
          boardingStatus: 'notBoarded',
          cabin: 'J',
          checkInStatus: 'notAccepted',
          fareFamily: {
            code: 'EY-JCOMFORT',
          },
          flightId: 'EY-61-20260113',
          id: '600795C5000382F3',
          orderId: '7OHQUF',
          regulatoryProgramsCheckStatuses: [
            {
              isOverallSuccess: true,
              regulatoryProgram: {
                countryCode: 'GBR',
              },
              statuses: [
                {
                  humanReadableDescription: 'OK to Board',
                  isSuccessful: true,
                  statusCode: '0',
                  statusType: 'SECURITY',
                },
                {
                  humanReadableDescription: 'Manual Check For Visa Nationals',
                  isSuccessful: true,
                  statusCode: 'Z',
                  statusType: 'IMMIGRATION',
                },
              ],
            },
            {
              regulatoryProgram: {
                name: 'ADC',
              },
              statuses: [
                {
                  statusCode: 'O',
                },
              ],
            },
          ],
          seatmapEligibility: {
            status: 'eligible',
          },
          travelerId: '610855C5000312CE',
        },
        '600795C5000382F4': {
          acceptanceEligibility: {
            eligibilityWindow: {
              closingDateAndTime: '2026-01-13T01:45:00+04:00',
              openingDateAndTime: '2026-01-11T20:45:00+04:00',
            },
            status: 'eligible',
          },
          boardingPassEligibility: {
            status: 'eligible',
          },
          boardingPassPrintStatus: 'printed',
          boardingStatus: 'notBoarded',
          cabin: 'J',
          checkInStatus: 'accepted',
          fareFamily: {
            code: 'EY-JCOMFORT',
          },
          flightId: 'EY-61-20260113',
          id: '600795C5000382F4',
          orderId: '7OHQUF',
          regulatoryProgramsCheckStatuses: [
            {
              isOverallSuccess: true,
              regulatoryProgram: {
                countryCode: 'ARE',
              },
              statuses: [
                {
                  humanReadableDescription: 'OK to Board if documents are OK',
                  isSuccessful: true,
                  statusCode: '',
                  statusType: 'SECURITY',
                },
              ],
            },
            {
              isOverallSuccess: true,
              regulatoryProgram: {
                countryCode: 'GBR',
              },
              statuses: [
                {
                  humanReadableDescription: 'OK to Board',
                  isSuccessful: true,
                  statusCode: '0',
                  statusType: 'SECURITY',
                },
                {
                  humanReadableDescription: 'Manual Check For Visa Nationals',
                  isSuccessful: true,
                  statusCode: 'Z',
                  statusType: 'IMMIGRATION',
                },
              ],
            },
            {
              regulatoryProgram: {
                name: 'ADC',
              },
              statuses: [
                {
                  statusCode: 'O',
                },
              ],
            },
          ],
          seat: {
            cabin: 'J',
            isInfantAloneOnSeat: false,
            isInfantOnSeat: false,
            seatAvailabilityStatus: 'occupied',
            seatCharacteristicsCodes: ['9', 'BC', 'N', 'UP'],
            seatNumber: '22F',
          },
          seatmapEligibility: {
            status: 'eligible',
          },
          travelerId: '610855C500031222',
        },
      },
      location: {
        AUH: {
          airportName: 'ABU DHABI ZAYED INTERNATION',
          cityCode: 'AUH',
          cityName: 'ABU DHABI',
          countryCode: 'AE',
          stateCode: '',
          type: 'airport',
        },
        LHR: {
          airportName: 'LONDON HEATHROW',
          cityCode: 'LON',
          cityName: 'LONDON',
          countryCode: 'GB',
          stateCode: '',
          type: 'airport',
        },
      },
      traveler: {
        '610855C500031222': {
          dateOfBirth: '1986-12-30',
          gender: 'male',
          id: '610855C500031222',
          isPilgrimConfirmationProvided: false,
          names: [
            {
              firstName: 'GAY',
              lastName: 'BAYER',
              nameType: 'universal',
              title: 'LORD',
            },
          ],
          passengerTypeCode: 'ADT',
        },
        '610855C5000312CE': {
          dateOfBirth: '2014-02-12',
          gender: 'male',
          id: '610855C5000312CE',
          isPilgrimConfirmationProvided: false,
          names: [
            {
              firstName: 'SILAS',
              lastName: 'BAYER',
              nameType: 'universal',
              title: '',
            },
          ],
          passengerTypeCode: 'CHD',
        },
      },
    },
  });
});

app.post('/api/one', (req, res) => {
  if (req.query.name === 'null') {
    return res
      .status(400)
      .json({
        error: {
          code: 'TST1001',
          message: 'Name query parameter is required.',
        },
      });
  }
  if (req.query.name === 'forbidden') {
    return res
      .status(403)
      .json({
        error: { code: 'TST1002', message: 'Access Forbidden for this name.' },
      });
  }
  if (req.query.name === 'notfound') {
    return res
      .status(404)
      .json({ error: { code: 'TST1003', message: 'Name not found.' } });
  }
  if (req.query.name === 'servererror') {
    return res
      .status(500)
      .json({ error: { code: 'TST1004', message: 'Internal server error.' } });
  }
  if (req.query.name === 'badrequest') {
    return res
      .status(400)
      .json({
        error: { code: 'TST1005', message: 'Bad Request for this name.' },
      });
  } else {
    return res.json({
      type: 'amadeusOAuth2Token',
      username:
        'GuiQHWUFVsdoCulnjnScqNp0046Fe7rbqesJrrhXwk@pkCxWvL21e3YJbycvvgBcKwrVRGQS5qhnsfItA2elY.com',
      application_name: '9WRw9aPX06cMDGzAveyWywFtLHkHHTMJ2IhQr2x4E',
      client_id: 'GYWAAGQgQaPdZvSla8HDexJnzrkLBq2b',
      token_type: 'Bearer',
      access_token: 'CMfRelgV6ShxU83nvGaeyMUAmMQd',
      expires_in: 1799,
      state: 'approved',
      scope: '',
      guest_office_id: '',
    });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
  });
}

module.exports = app;
