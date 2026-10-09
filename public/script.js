/** @format */

const menuToggle = document.querySelector(".menu-toggle");
const mobileMenu = document.getElementById("mobile-menu");
const viewCountNode = document.getElementById("portfolio-view-count");
const ownerViewBadge = document.getElementById("owner-view-badge");
const copyEmailBtn = document.getElementById("copy-email-btn");
const backToTopBtn = document.getElementById("back-to-top");
const homeContent = document.getElementById("home-content");
const blogGrid = document.getElementById("blog-grid");
const blogPagination = document.getElementById("blog-pagination");
const blogPrevPage = document.getElementById("blog-prev-page");
const blogNextPage = document.getElementById("blog-next-page");
const blogPageStatus = document.getElementById("blog-page-status");
const writingControlsTop = document.getElementById("writing-controls-top");
const blogPrevPageTop = document.getElementById("blog-prev-page-top");
const blogNextPageTop = document.getElementById("blog-next-page-top");
const blogDetail = document.getElementById("blog-detail");
const blogDetailStatus = document.getElementById("blog-detail-status");
const blogDetailContent = document.getElementById("blog-detail-content");
const blogDetailTitle = document.getElementById("blog-detail-title");
const blogDetailMeta = document.getElementById("blog-detail-meta");
const blogDetailCover = document.getElementById("blog-detail-cover");
const blogDetailTags = document.getElementById("blog-detail-tags");
const blogDetailBody = document.getElementById("blog-detail-body");
const blogDetailCategory = document.getElementById("blog-detail-category");
const blogToc = document.getElementById("blog-toc");
const blogTocList = document.getElementById("blog-toc-list");
const blogShareBtn = document.getElementById("blog-share-btn");
const blogCopyLinkBtn = document.getElementById("blog-copy-link-btn");
const blogRelated = document.getElementById("blog-related");
const blogRelatedList = document.getElementById("blog-related-list");
const blogToolsPanel = document.getElementById("blog-tools-panel");
const blogToolList = document.getElementById("blog-tool-list");
const blogLoaderOverlay = document.getElementById("blog-loader-overlay");
const ownerMaxViewsKey = "portfolio-owner-max-views";
const kofiWidgetId = "L3L71XQ4TR";
const kofiWidgetLabel = "Buy me a coffee on Ko-fi";
const kofiWidgetColors = {
  light: "#2b2d30",
  dark: "#41c9a2",
};
let copyResetTimer;
let activeHeadingObserver;
const countFormatter = new Intl.NumberFormat("en-US");
const searchParams = new URLSearchParams(globalThis.location.search);
const blogSlug = globalThis.location.pathname.match(/^\/blog\/([^/]+)\/?$/)?.[1];
const blogLoadingClass = "is-blog-loading";
const devArticlesUrl = "/api/blogs";
const blogRowsPerPage = 2;
const mobileBlogRowsPerPage = 4;
let blogListItems = [];
let currentBlogPage = 1;
let currentBlogsPerPage = 6;
let blogResizeTimer;

const safeStorageGet = (key) => {
  try {
    return globalThis.localStorage?.getItem(key) || null;
  } catch (_error) {
    return null;
  }
};

const safeStorageSet = (key, value) => {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch (_error) {
    // Safari private browsing can reject storage writes.
  }
};

const safeStorageRemove = (key) => {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch (_error) {
    // Safari private browsing can reject storage access.
  }
};

const formatPublishedDate = (value) => {
  if (!value) {
    return "Published date unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Published date unavailable";
  }

  return `Published: ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
};

const formatArticleCategory = (tags = []) => {
  const preferredTags = Array.isArray(tags) ? tags.filter(Boolean) : [];
  const primaryTag = preferredTags.find((tag) => !["webdev", "programming", "javascript", "typescript"].includes(String(tag).toLowerCase())) || preferredTags[0];

  if (!primaryTag) {
    return "Tech Writing";
  }

  return String(primaryTag)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const escapeHtml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const slugifyText = (value) => {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/gi, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "section";
};

const fetchFreshJson = async (path, params = {}) => {
  const url = new URL(path, globalThis.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  url.searchParams.set("_ts", Date.now().toString());

  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }

  return res.json();
};

const fetchDevArticles = async () => {
  const payload = await fetchFreshJson(devArticlesUrl, {
    per_page: 1000,
    all: 1,
  });

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("DEV articles response was malformed.");
  }

  const articles = Array.isArray(payload.blogs) ? payload.blogs : [];

  console.info(`DEV articles loaded: ${articles.length}`);

  return {
    articles,
    meta: { count: articles.length },
  };
};

const createCopyButton = (label) => {
  const button = document.createElement("button");
  button.className = "copy-code-button";
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = "Copy";
  button.innerHTML = '<i class="fa-regular fa-copy icon-copy" aria-hidden="true"></i><i class="fa-solid fa-check icon-check" aria-hidden="true"></i>';
  return button;
};

const writeClipboardText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_error) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.append(textarea);
    textarea.select();

    try {
      return document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }
};

// Owner badge is opt-in only for the current URL: ?owner=1
const isOwnerViewEnabled = searchParams.get("owner") === "1";

// Clear legacy persisted flag from older builds.
safeStorageRemove("portfolio-owner-view");

if (ownerViewBadge) {
  ownerViewBadge.hidden = !isOwnerViewEnabled;
}

const readOwnerMaxViews = () => {
  const raw = safeStorageGet(ownerMaxViewsKey);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const writeOwnerMaxViews = (value) => {
  if (!Number.isFinite(value)) {
    return;
  }
  safeStorageSet(ownerMaxViewsKey, String(value));
};

const renderOwnerCount = (value) => {
  if (!isOwnerViewEnabled || !viewCountNode) {
    return;
  }

  viewCountNode.textContent = value === null ? "--" : countFormatter.format(value);
};

const applyStableOwnerCount = (incomingCount) => {
  if (!Number.isFinite(incomingCount)) {
    renderOwnerCount(null);
    return;
  }

  const previousMax = readOwnerMaxViews();
  const stableCount = previousMax === null ? incomingCount : Math.max(previousMax, incomingCount);
  writeOwnerMaxViews(stableCount);
  renderOwnerCount(stableCount);
};

if (isOwnerViewEnabled && viewCountNode) {
  const knownValue = readOwnerMaxViews();
  renderOwnerCount(knownValue);
}

const drawKofiWidget = () => {
  if (!globalThis.kofiwidget2) {
    return;
  }

  const theme = document.documentElement.dataset.theme || "light";
  // globalThis.kofiwidget2.init(
  //   kofiWidgetLabel,
  //   kofiWidgetColors[theme] || kofiWidgetColors.light,
  //   kofiWidgetId,
  // );
  globalThis.kofiwidget2.draw();
};

drawKofiWidget();

const updatePortfolioViews = async () => {
  try {
    const response = await fetch("/api/views", { method: "POST" });

    if (!response.ok) {
      throw new Error(`Failed to update view count: ${response.status}`);
    }

    const payload = await response.json();
    applyStableOwnerCount(Number(payload.totalViews));
  } catch (error) {
    if (!isOwnerViewEnabled || !viewCountNode) {
      return;
    }

    console.error("Unable to update portfolio views:", error);
    renderOwnerCount(readOwnerMaxViews());
  }
};

updatePortfolioViews();

const copyEmailToClipboard = async () => {
  const email = copyEmailBtn?.dataset.email;

  if (!copyEmailBtn || !email) {
    return;
  }

  try {
    await navigator.clipboard.writeText(email);
    copyEmailBtn.classList.add("is-copied");
    copyEmailBtn.setAttribute("aria-label", "Email copied");

    globalThis.clearTimeout(copyResetTimer);
    copyResetTimer = globalThis.setTimeout(() => {
      if (!copyEmailBtn) {
        return;
      }

      copyEmailBtn.classList.remove("is-copied");
      copyEmailBtn.setAttribute("aria-label", "Copy email address");
    }, 1500);
  } catch (error) {
    console.error("Unable to copy email:", error);
  }
};

copyEmailBtn?.addEventListener("click", copyEmailToClipboard);

const setMobileMenuOpen = (isOpen) => {
  if (!menuToggle || !mobileMenu) {
    return;
  }

  mobileMenu.hidden = !isOpen;
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");

  const icon = menuToggle.querySelector("i");
  if (icon) {
    icon.className = isOpen ? "fa-solid fa-xmark" : "fa-solid fa-bars";
  }
};

menuToggle?.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
  setMobileMenuOpen(!isOpen);
});

mobileMenu?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setMobileMenuOpen(false));
});

// Editorial DEV.to journal. Uses the existing /api/blogs normalization and /blog/:slug routes.
const journalFeatured = document.getElementById("journal-featured");
const journalFilters = document.getElementById("journal-filters");
const journalSearch = document.getElementById("journal-search");
const journalSort = document.getElementById("journal-sort");
const journalResults = document.getElementById("journal-results");
const journalLoadMore = document.getElementById("journal-load-more");
const journalPageSize = 6;
let journalVisibleCount = journalPageSize;
let journalActiveTag = "all";
let journalQuery = "";

const journalDate = (publishedAt) => {
  const date = new Date(publishedAt || "");
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const journalArticleLink = (article) => {
  const url = String(article?.url || "");
  // Links are produced by normalizeDevArticle() on the server. Reject unexpected paths.
  return /^\/blog\/[a-z0-9-]+\/?$/.test(url) ? url : "/#blogs";
};

const journalCoverFallback = (featured) => `<span class="journal-cover-art" aria-hidden="true"><span class="journal-cover-orbit"></span><span class="journal-cover-wordmark">${featured ? "FIELD / NOTES" : "BUILD / LEARN"}</span></span>`;

// DEV cover URLs can expire. Replace failed images with the same designed fallback.
const journalRecoverCovers = (root) => {
  root?.querySelectorAll(".journal-cover img").forEach((image) => {
    const replaceBrokenImage = () => {
      const cover = image.closest(".journal-cover");
      if (cover) cover.innerHTML = journalCoverFallback(cover.classList.contains("journal-cover-featured"));
    };
    image.addEventListener("error", replaceBrokenImage, { once: true });
    if (image.complete && image.naturalWidth === 0) replaceBrokenImage();
  });
};

const journalCover = (article, featured = false) => {
  const cover = String(article?.coverImage || "");
  let isValidCover = false;
  try {
    isValidCover = new URL(cover).protocol === "https:";
  } catch (_error) { /* Use the designed fallback illustration. */ }
  const image = isValidCover
    ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" />`
    : journalCoverFallback(featured);
  return `<div class="journal-cover${featured ? " journal-cover-featured" : ""}">${image}</div>`;
};

const journalCategory = (article) => escapeHtml(formatArticleCategory(article.tags));
const journalTime = (article) => article.readingTimeMinutes ? `${Math.max(1, Math.round(Number(article.readingTimeMinutes) || 1))} min read` : "Article";
const journalCardTags = (article) => (Array.isArray(article.tags) ? article.tags : []).slice(0, 2)
  .map((tag) => `<span class="journal-tag">#${escapeHtml(tag)}</span>`).join("");

const renderBlogCard = (article) => `
  <article class="journal-card">
    <a href="${escapeHtml(journalArticleLink(article))}" class="journal-card-link" aria-label="Read ${escapeHtml(article.title)}">
      ${journalCover(article)}
      <div class="journal-card-content">
        <div class="journal-card-topline"><span>${journalCategory(article)}</span><span>${escapeHtml(journalTime(article))}</span></div>
        <h4>${escapeHtml(article.title)}</h4>
        <p class="journal-card-description">${escapeHtml(article.description || "A field note on software, systems, and making things better.")}</p>
        <div class="journal-card-footer"><time>${escapeHtml(journalDate(article.publishedAt))}</time><span class="journal-card-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-up-right-from-square"></i></span></div>
      </div>
    </a>
  </article>
`;

const renderJournalFeatured = (article) => {
  if (!journalFeatured) return;
  const tags = journalCardTags(article);
  journalFeatured.innerHTML = `
    <article class="journal-feature-story">
      <a class="journal-feature-media" href="${escapeHtml(journalArticleLink(article))}" aria-label="Read featured article: ${escapeHtml(article.title)}">${journalCover(article, true)}</a>
      <div class="journal-feature-copy">
        <div class="journal-feature-eyebrow"><span class="journal-feature-dot"></span> THE LATEST STORY <span class="journal-feature-separator">/</span> ${escapeHtml(journalDate(article.publishedAt))}</div>
        <span class="journal-feature-category">${journalCategory(article)} · ${escapeHtml(journalTime(article))}</span>
        <h3><a href="${escapeHtml(journalArticleLink(article))}">${escapeHtml(article.title)}</a></h3>
        <p>${escapeHtml(article.description || "A new note from the workbench.")}</p>
        <div class="journal-feature-tags">${tags}</div>
        <a class="journal-feature-cta" href="${escapeHtml(journalArticleLink(article))}">Read the story <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
      </div>
    </article>`;
  journalFeatured.hidden = false;
  journalRecoverCovers(journalFeatured);
};

const journalFilteredArticles = () => {
  const normalizedQuery = journalQuery.trim().toLowerCase();
  return blogListItems.filter((article) => {
    const tags = Array.isArray(article.tags) ? article.tags : [];
    const matchesTag = journalActiveTag === "all" || tags.some((tag) => String(tag).toLowerCase() === journalActiveTag);
    const searchableText = [article.title, article.description, ...tags].join(" ").toLowerCase();
    return matchesTag && (!normalizedQuery || searchableText.includes(normalizedQuery));
  }).sort((left, right) => {
    const leftTime = new Date(left.publishedAt || 0).getTime() || 0;
    const rightTime = new Date(right.publishedAt || 0).getTime() || 0;
    return journalSort?.value === "oldest" ? leftTime - rightTime : rightTime - leftTime;
  });
};

const renderJournalFilters = () => {
  if (!journalFilters) return;
  const counts = new Map();
  for (const article of blogListItems) {
    for (const tag of new Set((Array.isArray(article.tags) ? article.tags : []).map((value) => String(value).toLowerCase()))) {
      if (tag && !["programming", "webdev", "beginners", "discuss"].includes(tag)) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  const suggested = [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 5);
  journalFilters.innerHTML = [`<button type="button" class="journal-filter is-active" data-journal-tag="all" aria-pressed="true">All stories <span>${blogListItems.length}</span></button>`, ...suggested.map(([tag, count]) => `<button type="button" class="journal-filter" data-journal-tag="${escapeHtml(tag)}" aria-pressed="false">${escapeHtml(tag.replace(/[-_]/g," "))} <span>${count}</span></button>`)].join("");
};

const journalReset = () => {
  journalActiveTag = "all";
  journalQuery = "";
  if (journalSearch) journalSearch.value = "";
  if (journalSort) journalSort.value = "newest";
  journalVisibleCount = journalPageSize;
  renderBlogPage();
};

const renderBlogPage = () => {
  if (!blogGrid) return;
  const isDefaultView = journalActiveTag === "all" && !journalQuery.trim() && journalSort?.value !== "oldest";
  const matched = journalFilteredArticles();
  const featuredArticle = isDefaultView ? matched[0] : null;
  if (featuredArticle) renderJournalFeatured(featuredArticle);
  else if (journalFeatured) { journalFeatured.hidden = true; journalFeatured.innerHTML = ""; }
  const listing = featuredArticle ? matched.slice(1) : matched;
  const visible = listing.slice(0, journalVisibleCount);
  blogGrid.setAttribute("aria-busy", "false");
  if (visible.length) {
    blogGrid.innerHTML = visible.map(renderBlogCard).join("");
  } else if (featuredArticle) {
    blogGrid.innerHTML = '<p class="journal-empty">More stories are on their way. In the meantime, enjoy the featured read above.</p>';
  } else {
    blogGrid.innerHTML = '<div class="journal-empty"><strong>No matching stories.</strong><p>Try another topic or a shorter search.</p><button type="button" class="journal-reset" id="journal-reset">Clear filters <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div>';
    blogGrid.querySelector("#journal-reset")?.addEventListener("click", journalReset);
  }
  journalRecoverCovers(blogGrid);
  if (journalResults) {
    const label = matched.length === 1 ? "story" : "stories";
    journalResults.textContent = `${matched.length} ${label} ${journalActiveTag !== "all" || journalQuery ? "found" : "in the journal"}`;
  }
  if (blogPagination && journalLoadMore) {
    blogPagination.hidden = listing.length <= journalVisibleCount;
    journalLoadMore.textContent = `Show more stories (${listing.length - journalVisibleCount} remaining) ↓`;
  }
  for (const button of journalFilters?.querySelectorAll("[data-journal-tag]") || []) {
    const selected = button.dataset.journalTag === journalActiveTag;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
};

const showJournalFallback = (message) => {
  if (!blogGrid) return;
  if (journalFeatured) journalFeatured.hidden = true;
  blogGrid.setAttribute("aria-busy", "false");
  blogGrid.innerHTML = `<div class="journal-empty journal-unavailable"><strong>${escapeHtml(message)}</strong><p>You can still find every published story on DEV.</p><div class="journal-fallback-actions"><button id="journal-retry" type="button" class="journal-reset">Try again ↻</button><a href="https://dev.to/amrishkhan05" target="_blank" rel="noopener noreferrer">Browse DEV <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a></div></div>`;
  blogGrid.querySelector("#journal-retry")?.addEventListener("click", renderBlogList);
  if (journalResults) journalResults.textContent = "The journal is temporarily unavailable";
  if (blogPagination) blogPagination.hidden = true;
};

const renderBlogList = async () => {
  if (!blogGrid || blogSlug) return;
  blogGrid.setAttribute("aria-busy", "true");
  blogGrid.innerHTML = '<div class="journal-skeleton" aria-hidden="true"></div><div class="journal-skeleton" aria-hidden="true"></div><div class="journal-skeleton" aria-hidden="true"></div>';
  if (journalResults) journalResults.textContent = "Loading the journal...";
  if (blogPagination) blogPagination.hidden = true;
  try {
    const { articles } = await fetchDevArticles();
    if (!articles.length) { showJournalFallback("No stories could be loaded right now."); return; }
    blogListItems = articles;
    journalActiveTag = "all";
    journalQuery = "";
    journalVisibleCount = journalPageSize;
    if (journalSearch) journalSearch.value = "";
    if (journalSort) journalSort.value = "newest";
    renderJournalFilters();
    renderBlogPage();
  } catch (error) {
    console.error("Unable to load DEV journal:", error);
    showJournalFallback("The stories are taking a little longer to arrive.");
  }
};

journalFilters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-journal-tag]");
  if (!button || !journalFilters.contains(button)) return;
  journalActiveTag = button.dataset.journalTag || "all";
  journalVisibleCount = journalPageSize;
  renderBlogPage();
});

journalSearch?.addEventListener("input", () => {
  journalQuery = journalSearch.value;
  journalVisibleCount = journalPageSize;
  renderBlogPage();
});

journalSort?.addEventListener("change", () => {
  journalVisibleCount = journalPageSize;
  renderBlogPage();
});

journalLoadMore?.addEventListener("click", () => {
  journalVisibleCount += journalPageSize;
  renderBlogPage();
});

const showBlogStatus = (message) => {
  if (!blogDetailStatus) {
    return;
  }

  blogDetailStatus.hidden = false;
  blogDetailStatus.textContent = message;
};

const setBlogLoading = (isLoading) => {
  const root = document.documentElement;
  if (isLoading) {
    root.classList.remove("is-blog-ready");
    root.classList.add(blogLoadingClass);
    if (blogLoaderOverlay) blogLoaderOverlay.hidden = false;
    return;
  }

  // Commit the entire reading shell in one paint, never the TOC by itself.
  root.classList.add("is-blog-ready");
  root.classList.remove(blogLoadingClass);
  if (blogLoaderOverlay) {
    globalThis.setTimeout(() => {
      if (!root.classList.contains(blogLoadingClass)) blogLoaderOverlay.hidden = true;
    }, 260);
  }
};

const prepareArticleFirstPaint = async () => {
  const tasks = [];
  // The article cover has a reserved frame; a short decode wait avoids a second
  // content swap without holding visitors indefinitely on a slow CDN.
  if (blogDetailCover && !blogDetailCover.hidden && blogDetailCover.getAttribute("src")) {
    if (typeof blogDetailCover.decode === "function") {
      tasks.push(blogDetailCover.decode().catch(() => {}));
    }
  }
  if (document.fonts?.ready) tasks.push(document.fonts.ready.catch(() => {}));
  await Promise.race([
    Promise.all(tasks),
    new Promise(resolve => globalThis.setTimeout(resolve, 450)),
  ]);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};

const slugifyHeading = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

let tocObserver = null;

const generateToc = (bodyEl) => {
  const tocNav = document.getElementById("blog-toc-nav");
  const tocEl = document.getElementById("blog-toc");
  if (!tocNav || !bodyEl || !tocEl) return;

  const headings = Array.from(bodyEl.querySelectorAll("h1, h2, h3, h4"));
  if (headings.length < 2) {
    tocEl.style.display = "none";
    return;
  }

  const usedIds = new Set();
  headings.forEach((h) => {
    if (!h.id) {
      let base = slugifyHeading(h.textContent || "") || "section";
      let id = base;
      let n = 1;
      while (usedIds.has(id)) id = `${base}-${n++}`;
      usedIds.add(id);
      h.id = id;
    } else {
      usedIds.add(h.id);
    }
  });

  tocNav.innerHTML = headings
    .map((h) => {
      const level = h.tagName.toLowerCase();
      return `<a href="#${h.id}" class="toc-${level}" data-toc-id="${h.id}">${escapeHtml(h.textContent?.trim() || "")}</a>`;
    })
    .join("");

  tocNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const target = document.getElementById(link.dataset.tocId || "");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  if (tocObserver) tocObserver.disconnect();

  const allLinks = Array.from(tocNav.querySelectorAll("a"));
  tocObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        allLinks.forEach((link) => {
          link.classList.toggle("toc-active", link.dataset.tocId === id);
        });
      });
    },
    { rootMargin: "-52px 0px -68% 0px", threshold: 0 },
  );

  headings.forEach((h) => tocObserver.observe(h));
};

const cleanupArticleImages = (bodyEl) => {
  if (!bodyEl) return;

  [".image-btn", 'button[aria-label="Expand"]', 'button[aria-label="Fit to screen"]', ".js-full-screen-action", ".ltag__image__comments"].forEach((sel) =>
    bodyEl.querySelectorAll(sel).forEach((el) => el.remove()),
  );

  bodyEl.querySelectorAll(".article-body-image-wrapper").forEach((wrapper) => {
    const img = wrapper.querySelector("img");
    if (img && wrapper.parentNode) wrapper.parentNode.replaceChild(img, wrapper);
  });
};

const getTagOverlap = (a, b) => {
  const set = new Set((a || []).map((t) => String(t).toLowerCase()));
  return (b || []).filter((t) => set.has(String(t).toLowerCase())).length;
};

const loadRelatedArticles = async (currentSlug, currentTags) => {
  const listEl = document.getElementById("blog-related-list");
  if (!listEl) return;

  try {
    const { articles: blogs } = await fetchDevArticles();

    const others = blogs.filter((b) => {
      const slug = b.devSlug || b.localSlug || "";
      return slug !== currentSlug && !b.url?.endsWith(`/${currentSlug}`);
    });

    others.sort((a, b) => {
      const diff = getTagOverlap(currentTags, b.tags) - getTagOverlap(currentTags, a.tags);
      return diff !== 0 ? diff : new Date(b.publishedAt) - new Date(a.publishedAt);
    });

    const top = others.slice(0, 5);
    if (top.length === 0) {
      listEl.innerHTML = "";
      return;
    }

    listEl.innerHTML = top
      .map(
        (b) => `
        <a class="blog-related-card" href="${escapeHtml(b.url)}">
          <h4>${escapeHtml(b.title)}</h4>
          <p>${escapeHtml(formatPublishedDate(b.publishedAt))}${b.readingTimeMinutes ? ` · ${escapeHtml(String(b.readingTimeMinutes))} min` : ""}</p>
        </a>`,
      )
      .join("");
  } catch (_err) {
    const listEl2 = document.getElementById("blog-related-list");
    if (listEl2) listEl2.innerHTML = "";
  }
};

const formatCodeLanguage = (value) => {
  const raw = String(value || "")
    .split(/\s+/)
    .find((name) => /^(language-|lang-)/.test(name));

  if (!raw) {
    return "Code";
  }

  const language = raw.replace(/^(language-|lang-)/, "");
  return language ? language.toUpperCase() : "Code";
};

const getCodeBlockText = (pre) => pre.querySelector("code")?.textContent || pre.textContent || "";

const enhanceBlogTables = () => {
  blogDetailBody?.querySelectorAll("table").forEach((table) => {
    if (table.parentElement?.classList.contains("blog-table-wrap")) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "blog-table-wrap";
    table.parentNode.insertBefore(wrapper, table);
    wrapper.append(table);
  });
};

const cleanBlogMedia = () => {
  if (!blogDetailBody) {
    return;
  }

  blogDetailBody
    .querySelectorAll(
      ".highlight__panel, .js-actions-panel, .js-fullscreen-code-action, .image-viewer, .image-overlay, .image-controls, .expand-button, .fit-button, .fullscreen-button, .js-fullsize-image, [data-image-viewer], [data-lightbox]",
    )
    .forEach((node) => node.remove());

  blogDetailBody.querySelectorAll(".article-body-image-wrapper").forEach((node) => {
    node.removeAttribute("class");
    node.removeAttribute("data-image-viewer");
    node.removeAttribute("data-lightbox");
  });

  blogDetailBody.querySelectorAll("img").forEach((image) => {
    if (/^(enter|exit) fullscreen mode$/i.test(image.alt || "")) {
      image.remove();
      return;
    }

    const deferredSrc = image.getAttribute("data-src");
    const currentSrc = image.getAttribute("src");
    if (deferredSrc && /^https:\/\//i.test(deferredSrc) && (!currentSrc || /^data:/i.test(currentSrc))) {
      image.src = deferredSrc;
    }
    image.loading = "lazy";
    image.decoding = "async";
    image.removeAttribute("data-src");
    image.removeAttribute("data-pin-media");
    image.classList.remove("js-fullsize-image");
  });
};

const enhanceBlogCodeBlocks = () => {
  if (!blogDetailBody) {
    return;
  }

  blogDetailBody.querySelectorAll("pre").forEach((pre, index) => {
    if (pre.closest(".blog-code-block")) {
      return;
    }

    const code = pre.querySelector("code");
    const language = formatCodeLanguage(`${pre.className || ""} ${code?.className || ""}`);
    const wrapper = document.createElement("div");
    const toolbar = document.createElement("div");
    const label = document.createElement("span");
    const button = createCopyButton(`Copy ${language.toLowerCase()} snippet`);
    const codeId = `blog-code-${blogSlug || "article"}-${index + 1}`;

    wrapper.className = "blog-code-block";
    toolbar.className = "blog-code-toolbar";
    label.className = "blog-code-language";
    label.textContent = language;
    button.dataset.codeTarget = codeId;
    pre.id = pre.id || codeId;

    toolbar.append(label, button);
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.append(toolbar, pre);
  });
};

const buildBlogToc = () => {
  if (!blogDetailBody || !blogToc || !blogTocList) {
    return;
  }

  activeHeadingObserver?.disconnect();
  const usedIds = new Set();
  const headings = Array.from(blogDetailBody.querySelectorAll("h1, h2, h3, h4")).filter((heading) => heading.textContent.trim());

  headings.forEach((heading) => {
    const baseId = heading.id || slugifyText(heading.textContent);
    let nextId = baseId;
    let suffix = 2;

    while (usedIds.has(nextId) || document.getElementById(nextId)) {
      if (heading.id === nextId) {
        break;
      }
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }

    heading.id = nextId;
    usedIds.add(nextId);
  });

  if (!headings.length) {
    blogToc.hidden = true;
    blogTocList.innerHTML = "";
    return;
  }

  blogTocList.innerHTML = headings
    .map((heading) => {
      const level = heading.tagName.toLowerCase();
      return `<a class="blog-toc-link is-${level}" href="#${escapeHtml(heading.id)}" data-heading-id="${escapeHtml(heading.id)}">${escapeHtml(heading.textContent.trim())}</a>`;
    })
    .join("");
  blogToc.hidden = false;

  const links = Array.from(blogTocList.querySelectorAll(".blog-toc-link"));
  const setActiveLink = (id) => {
    links.forEach((link) => {
      link.classList.toggle("is-active", link.dataset.headingId === id);
    });
  };

  activeHeadingObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      if (visible[0]?.target.id) {
        setActiveLink(visible[0].target.id);
      }
    },
    { rootMargin: "-18% 0px -68% 0px", threshold: [0, 1] },
  );

  headings.forEach((heading) => activeHeadingObserver.observe(heading));
  setActiveLink(headings[0].id);
};

const renderRelatedArticles = async (currentArticle) => {
  if (!blogRelated || !blogRelatedList) {
    return;
  }

  try {
    const { articles: blogs } = await fetchDevArticles();
    const currentTags = new Set((Array.isArray(currentArticle.tags) ? currentArticle.tags : []).map((tag) => String(tag).toLowerCase()));
    const related = blogs
      .filter((blog) => blog.localSlug !== currentArticle.localSlug && blog.devSlug !== currentArticle.devSlug && blog.url !== currentArticle.url)
      .map((blog) => {
        const score = (Array.isArray(blog.tags) ? blog.tags : []).reduce((total, tag) => total + (currentTags.has(String(tag).toLowerCase()) ? 1 : 0), 0);
        return { ...blog, score };
      })
      .sort((a, b) => b.score - a.score || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
      .slice(0, 4);

    if (!related.length) {
      blogRelated.hidden = true;
      return;
    }

    blogRelatedList.innerHTML = related
      .map(
        (blog) => `<a class="blog-related-card" href="${escapeHtml(blog.url)}">
          <span>${escapeHtml(formatPublishedDate(blog.publishedAt).replace("Published: ", ""))}</span>
          <strong>${escapeHtml(blog.title)}</strong>
        </a>`,
      )
      .join("");
    blogRelated.hidden = false;
  } catch (error) {
    console.error("Unable to load related DEV articles:", error);
    blogRelated.hidden = true;
  }
};

const renderRelatedTools = (article) => {
  if (!blogToolsPanel || !blogToolList) {
    return;
  }

  const text = `${article.title || ""} ${article.description || ""} ${(article.tags || []).join(" ")} ${blogDetailBody?.textContent || ""}`.toLowerCase();
  const tools = [
    {
      name: "JSON Formatter",
      href: "/aruvix#json-formatter",
      keywords: ["json", "api", "payload", "response"],
    },
    {
      name: "API Tester",
      href: "/aruvix#api-tester",
      keywords: ["api", "postman", "http", "request", "endpoint"],
    },
    {
      name: "Curl Converter",
      href: "/aruvix#curl-converter",
      keywords: ["curl", "terminal", "http", "request"],
    },
  ].filter((tool) => tool.keywords.some((keyword) => text.includes(keyword)));

  if (!tools.length) {
    blogToolsPanel.hidden = true;
    blogToolList.innerHTML = "";
    return;
  }

  blogToolList.innerHTML = tools
    .map(
      (tool) => `<a class="blog-tool-link" href="${escapeHtml(tool.href)}">
        <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
        <span>${escapeHtml(tool.name)}</span>
      </a>`,
    )
    .join("");
  blogToolsPanel.hidden = false;
};

blogDetailBody?.addEventListener("click", async (event) => {
  const target = event.target;
  const button = target instanceof Element ? target.closest(".copy-code-button") : null;

  if (!button) {
    return;
  }

  const pre = button.closest(".blog-code-block")?.querySelector("pre");

  if (!pre) {
    return;
  }

  try {
    const didCopy = await writeClipboardText(getCodeBlockText(pre));

    if (!didCopy) {
      throw new Error("Clipboard write was rejected.");
    }

    button.classList.add("is-copied");
    button.title = "Copied";
    button.setAttribute("aria-label", "Code snippet copied");

    globalThis.setTimeout(() => {
      button.classList.remove("is-copied");
      button.title = "Copy";
      button.setAttribute("aria-label", "Copy code snippet");
    }, 1400);
  } catch (error) {
    button.title = "Copy failed";
    button.setAttribute("aria-label", "Copy failed");

    globalThis.setTimeout(() => {
      button.title = "Copy";
      button.setAttribute("aria-label", "Copy code snippet");
    }, 1400);
  }
});

// React to late and early image failures, including images from DEV.to HTML.
const recoverFailedArticleImage = image => {
  if (!image || image.dataset.imageRecovered === "1") return;
  const backup = image.dataset.fallbackSrc;
  if (backup && !image.dataset.backupTried && /^https:\/\//i.test(backup)) {
    image.dataset.backupTried = "1";
    image.src = backup;
    return;
  }
  image.dataset.imageRecovered = "1";
  if (image.id === "blog-detail-cover") {
    image.hidden = true;
    image.removeAttribute("src"); // Permanent editorial cover underneath.
  } else if (image.closest(".blog-body")) {
    const box = document.createElement("div");
    box.className = "blog-media-unavailable";
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", image.alt ? "Image unavailable: " + image.alt : "Article illustration unavailable");
    box.innerHTML = '<span aria-hidden="true">{ /* IMAGE UNAVAILABLE */ }</span><small>The article text is still here.</small>';
    image.replaceWith(box);
  }
};
document.addEventListener("error", event => {
  const node = event.target;
  if (node instanceof HTMLImageElement && (node.id === "blog-detail-cover" || node.closest(".blog-body"))) {
    recoverFailedArticleImage(node);
  }
}, true);
const recoverArticleImages = () => {
  document.querySelectorAll("#blog-detail-cover, .blog-body img").forEach(image => {
    if (!image.hidden && image.complete && image.naturalWidth === 0 && image.getAttribute("src")) {
      recoverFailedArticleImage(image);
    }
  });
};

const renderBlogDetail = async () => {
  if (!blogSlug || !blogDetail) {
    renderBlogList();
    return;
  }

  document.body.classList.add("is-blog-view");

  if (homeContent) {
    homeContent.hidden = true;
  }

  blogDetail.hidden = false;
  setBlogLoading(true);
  const startTime = Date.now();
  const hasServerRenderedArticle = Boolean(blogDetailContent && !blogDetailContent.hidden && blogDetailBody?.textContent.trim());

  // SSR is already a complete page. Re-fetching and rewriting it was causing
  // the title, cover, sidebar and content to jump after navigation.
  if (hasServerRenderedArticle) {
    cleanBlogMedia();
    recoverArticleImages();
    enhanceBlogTables();
    enhanceBlogCodeBlocks();
    buildBlogToc();
    recoverArticleImages();
    await prepareArticleFirstPaint();
    setBlogLoading(false);
    fetchFreshJson(`/api/blogs/${encodeURIComponent(blogSlug)}`)
      .then(article => {
        if (article && typeof article === "object") {
          renderRelatedTools(article);
          renderRelatedArticles(article);
        }
      }).catch(() => {});
    return;
  }

  // Even SSR articles stay hidden behind the terminal until their layout is ready.
  if (!hasServerRenderedArticle) {
    showBlogStatus("Loading...");
  }

  try {
    const article = await fetchFreshJson(`/api/blogs/${encodeURIComponent(blogSlug)}`);

    if (!article || typeof article !== "object" || Array.isArray(article)) {
      throw new Error("Blog article response was malformed.");
    }

    const tags = Array.isArray(article.tags) ? article.tags : [];

    document.title = `${article.title} | amrishkhan.dev`;
    blogDetailTitle.textContent = article.title;
    blogDetailMeta.innerHTML = [formatPublishedDate(article.publishedAt), article.readingTimeMinutes ? `${article.readingTimeMinutes} min read` : null]
      .filter(Boolean)
      .map((item) => `<span>${escapeHtml(item)}</span>`)
      .join("");
    if (blogDetailCategory) {
      blogDetailCategory.textContent = formatArticleCategory(tags);
    }
    blogDetailTags.innerHTML = tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");

    if (typeof article.coverImage === "string" && /^https:\/\//i.test(article.coverImage)) {
      blogDetailCover.dataset.fallbackSrc = typeof article.coverImageFallback === "string" && /^https:\/\//i.test(article.coverImageFallback) ? article.coverImageFallback : "";
      blogDetailCover.removeAttribute("data-backup-tried");
      blogDetailCover.src = article.coverImage;
      blogDetailCover.hidden = false;
    } else {
      blogDetailCover.removeAttribute("src");
      blogDetailCover.hidden = true;
    }

    if (article.bodyHtml) {
      blogDetailBody.innerHTML = article.bodyHtml;
    } else if (article.bodyMarkdown) {
      blogDetailBody.innerHTML = `<pre class="blog-markdown-source">${escapeHtml(article.bodyMarkdown)}</pre>`;
    } else {
      blogDetailBody.innerHTML = `<p>${escapeHtml(article.message || "This article is temporarily unavailable.")}</p>`;
    }

    cleanBlogMedia();
    enhanceBlogTables();
    enhanceBlogCodeBlocks();
    buildBlogToc();
    renderRelatedTools(article);
    renderRelatedArticles(article);
    blogDetailStatus.hidden = true;
    blogDetailContent.hidden = false;
    await prepareArticleFirstPaint();
    updateScrollProgress();
  } catch (error) {
    console.error("Unable to load DEV blog article:", error);
    if (!hasServerRenderedArticle) {
      showBlogStatus("This article is temporarily unavailable.");
    }
  } finally {
    if (!hasServerRenderedArticle) {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < 250) await new Promise((resolve) => setTimeout(resolve, 250 - elapsedTime));
    }
    setBlogLoading(false);
  }
};

renderBlogDetail();

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.animationPlayState = "running";
      }
    });
  },
  { threshold: 0.12 },
);

document.querySelectorAll(".reveal").forEach((node) => {
  observer.observe(node);
});

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || !entry.target.id) {
        return;
      }

      document.querySelectorAll(".nav-links a").forEach((link) => {
        const href = link.getAttribute("href") || "";
        const isMatch = href === `#${entry.target.id}` || href === `/#${entry.target.id}`;
        link.classList.toggle("is-active", isMatch);
      });
    });
  },
  { threshold: 0.5 },
);

document.querySelectorAll("main section[id]").forEach((section) => {
  sectionObserver.observe(section);
});

const topNav = document.querySelector(".top-nav");

const updateScrollProgress = () => {
  const scrollTop = globalThis.scrollY;
  const scrollHeight = document.documentElement.scrollHeight - globalThis.innerHeight;
  const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;

  document.body.style.setProperty("--scroll-progress", `${progress}%`);
  topNav?.classList.toggle("is-scrolled", scrollTop > 10);
  backToTopBtn?.classList.toggle("is-visible", scrollTop > 520);
};

globalThis.addEventListener("scroll", updateScrollProgress, { passive: true });
updateScrollProgress();

backToTopBtn?.addEventListener("click", () => {
  globalThis.scrollTo({ top: 0, behavior: "smooth" });
});

globalThis.addEventListener("pointermove", (event) => {
  document.body.style.setProperty("--mx", `${event.clientX}px`);
  document.body.style.setProperty("--my", `${event.clientY}px`);
});

blogShareBtn?.addEventListener("click", async () => {
  if (navigator.share) {
    try {
      await navigator.share({
        title: document.title,
        url: window.location.href,
      });
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error sharing article:", error);
      }
    }
  } else {
    copyArticleLink();
  }
});

const copyArticleLink = async () => {
  if (!blogCopyLinkBtn) return;

  try {
    const success = await writeClipboardText(window.location.href);
    if (!success) throw new Error("Clipboard write failed");

    const originalIcon = blogCopyLinkBtn.innerHTML;
    blogCopyLinkBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    blogCopyLinkBtn.classList.add("is-copied");
    blogCopyLinkBtn.setAttribute("aria-label", "Link copied");

    setTimeout(() => {
      blogCopyLinkBtn.innerHTML = originalIcon;
      blogCopyLinkBtn.classList.remove("is-copied");
      blogCopyLinkBtn.setAttribute("aria-label", "Copy article link");
    }, 1500);
  } catch (error) {
    console.error("Unable to copy article link:", error);
  }
};

blogCopyLinkBtn?.addEventListener("click", copyArticleLink);
