/** @format */

const themeToggles = Array.from(document.querySelectorAll('.theme-toggle'));
const themeToggle = themeToggles[0] || null;
const menuToggle = document.querySelector('.menu-toggle');
const mobileMenu = document.getElementById('mobile-menu');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
const viewCountNode = document.getElementById('portfolio-view-count');
const ownerViewBadge = document.getElementById('owner-view-badge');
const copyEmailBtn = document.getElementById('copy-email-btn');
const backToTopBtn = document.getElementById('back-to-top');
const homeContent = document.getElementById('home-content');
const blogGrid = document.getElementById('blog-grid');
const blogDetail = document.getElementById('blog-detail');
const blogDetailStatus = document.getElementById('blog-detail-status');
const blogDetailContent = document.getElementById('blog-detail-content');
const blogDetailTitle = document.getElementById('blog-detail-title');
const blogDetailMeta = document.getElementById('blog-detail-meta');
const blogDetailSummary = document.getElementById('blog-detail-summary');
const blogDetailCover = document.getElementById('blog-detail-cover');
const blogDetailTags = document.getElementById('blog-detail-tags');
const blogDetailBody = document.getElementById('blog-detail-body');
const blogToc = document.getElementById('blog-toc');
const blogTocList = document.getElementById('blog-toc-list');
const blogRelated = document.getElementById('blog-related');
const blogRelatedList = document.getElementById('blog-related-list');
const blogToolsPanel = document.getElementById('blog-tools-panel');
const blogToolList = document.getElementById('blog-tool-list');
const ownerMaxViewsKey = 'portfolio-owner-max-views';
const themeStorageKey = 'portfolio-theme';
const lightThemeColor = '#f8f8f5';
const darkThemeColor = '#0a0f1a';
const kofiWidgetId = 'L3L71XQ4TR';
const kofiWidgetLabel = 'Buy me a coffee on Ko-fi';
const kofiWidgetColors = {
  light: '#2b2d30',
  dark: '#41c9a2',
};
let copyResetTimer;
let activeHeadingObserver;
const prefersDark = globalThis.matchMedia?.(
  '(prefers-color-scheme: dark)',
)?.matches;
const countFormatter = new Intl.NumberFormat('en-US');
const searchParams = new URLSearchParams(globalThis.location.search);
const blogSlug = globalThis.location.pathname.match(/^\/blog\/([^/]+)\/?$/)?.[1];

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
    return 'Published date unavailable';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Published date unavailable';
  }

  return `Published: ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const slugifyText = (value) => {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'section';
};

const createCopyButton = (label) => {
  const button = document.createElement('button');
  button.className = 'copy-code-button';
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = 'Copy';
  button.innerHTML =
    '<i class="fa-regular fa-copy icon-copy" aria-hidden="true"></i><i class="fa-solid fa-check icon-check" aria-hidden="true"></i>';
  return button;
};

const writeClipboardText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_error) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.append(textarea);
    textarea.select();

    try {
      return document.execCommand('copy');
    } finally {
      textarea.remove();
    }
  }
};

// Owner badge is opt-in only for the current URL: ?owner=1
const isOwnerViewEnabled = searchParams.get('owner') === '1';

// Clear legacy persisted flag from older builds.
safeStorageRemove('portfolio-owner-view');

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

  viewCountNode.textContent =
    value === null ? '--' : countFormatter.format(value);
};

const applyStableOwnerCount = (incomingCount) => {
  if (!Number.isFinite(incomingCount)) {
    renderOwnerCount(null);
    return;
  }

  const previousMax = readOwnerMaxViews();
  const stableCount =
    previousMax === null ? incomingCount : Math.max(previousMax, incomingCount);
  writeOwnerMaxViews(stableCount);
  renderOwnerCount(stableCount);
};

if (isOwnerViewEnabled && viewCountNode) {
  const knownValue = readOwnerMaxViews();
  renderOwnerCount(knownValue);
}

const applyTheme = (theme) => {
  const scheme = theme === 'dark' ? 'dark' : 'only light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = scheme;
  const isDark = theme === 'dark';
  themeColorMeta?.setAttribute(
    'content',
    isDark ? darkThemeColor : lightThemeColor,
  );
  colorSchemeMeta?.setAttribute('content', scheme);

  themeToggles.forEach((toggle) => {
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute(
      'aria-label',
      isDark ? 'Switch to light theme' : 'Switch to dark theme',
    );

    const icon = toggle.querySelector('i');
    if (icon) {
      icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
  });
};

const savedTheme = safeStorageGet(themeStorageKey);
const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
applyTheme(initialTheme);

const drawKofiWidget = () => {
  if (!globalThis.kofiwidget2) {
    return;
  }

  const theme = document.documentElement.dataset.theme || 'light';
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
    const response = await fetch('/api/views', { method: 'POST' });

    if (!response.ok) {
      throw new Error(`Failed to update view count: ${response.status}`);
    }

    const payload = await response.json();
    applyStableOwnerCount(Number(payload.totalViews));
  } catch (error) {
    if (!isOwnerViewEnabled || !viewCountNode) {
      return;
    }

    console.error('Unable to update portfolio views:', error);
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
    copyEmailBtn.classList.add('is-copied');
    copyEmailBtn.setAttribute('aria-label', 'Email copied');

    globalThis.clearTimeout(copyResetTimer);
    copyResetTimer = globalThis.setTimeout(() => {
      if (!copyEmailBtn) {
        return;
      }

      copyEmailBtn.classList.remove('is-copied');
      copyEmailBtn.setAttribute('aria-label', 'Copy email address');
    }, 1500);
  } catch (error) {
    console.error('Unable to copy email:', error);
  }
};

copyEmailBtn?.addEventListener('click', copyEmailToClipboard);

themeToggles.forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'light';
    const next = current === 'dark' ? 'light' : 'dark';

    applyTheme(next);
    safeStorageSet(themeStorageKey, next);
  });
});

const setMobileMenuOpen = (isOpen) => {
  if (!menuToggle || !mobileMenu) {
    return;
  }

  mobileMenu.hidden = !isOpen;
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');

  const icon = menuToggle.querySelector('i');
  if (icon) {
    icon.className = isOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
  }
};

menuToggle?.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  setMobileMenuOpen(!isOpen);
});

mobileMenu?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => setMobileMenuOpen(false));
});

const renderBlogCard = (blog) => {
  const tags = Array.isArray(blog.tags) ? blog.tags : [];

  return `
    <a class="blog-card" href="${escapeHtml(blog.url)}">
      <h4>${escapeHtml(blog.title)}</h4>
      <p class="blog-meta">${escapeHtml(formatPublishedDate(blog.publishedAt))}${
        blog.readingTimeMinutes
          ? ` • ${escapeHtml(blog.readingTimeMinutes)} min read`
          : ''
      }</p>
      <div class="blog-tags">
        ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}
      </div>
    </a>
  `;
};

const renderBlogList = async () => {
  if (!blogGrid || blogSlug) {
    return;
  }

  try {
    const response = await fetch('/api/blogs');

    if (!response.ok) {
      throw new Error(`Failed to load blogs: ${response.status}`);
    }

    const payload = await response.json();

    if (!Array.isArray(payload.blogs) || payload.blogs.length === 0) {
      return;
    }

    blogGrid.innerHTML = payload.blogs.map(renderBlogCard).join('');
  } catch (error) {
    console.error('Unable to load DEV blog list:', error);
  }
};

const showBlogStatus = (message) => {
  if (!blogDetailStatus) {
    return;
  }

  blogDetailStatus.hidden = false;
  blogDetailStatus.textContent = message;
};

const slugifyHeading = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

let tocObserver = null;

const generateToc = (bodyEl) => {
  const tocNav = document.getElementById('blog-toc-nav');
  const tocEl = document.getElementById('blog-toc');
  if (!tocNav || !bodyEl || !tocEl) return;

  const headings = Array.from(bodyEl.querySelectorAll('h2, h3'));
  if (headings.length < 2) {
    tocEl.style.display = 'none';
    return;
  }

  const usedIds = new Set();
  headings.forEach((h) => {
    if (!h.id) {
      let base = slugifyHeading(h.textContent || '') || 'section';
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
      const isH3 = h.tagName === 'H3';
      return `<a href="#${h.id}" class="${isH3 ? 'toc-h3' : ''}" data-toc-id="${h.id}">${escapeHtml(h.textContent?.trim() || '')}</a>`;
    })
    .join('');

  tocNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(link.dataset.tocId || '');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  if (tocObserver) tocObserver.disconnect();

  const allLinks = Array.from(tocNav.querySelectorAll('a'));
  tocObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        allLinks.forEach((link) => {
          link.classList.toggle('toc-active', link.dataset.tocId === id);
        });
      });
    },
    { rootMargin: '-52px 0px -68% 0px', threshold: 0 },
  );

  headings.forEach((h) => tocObserver.observe(h));
};

const cleanupArticleImages = (bodyEl) => {
  if (!bodyEl) return;

  [
    '.image-btn',
    'button[aria-label="Expand"]',
    'button[aria-label="Fit to screen"]',
    '.js-full-screen-action',
    '.ltag__image__comments',
  ].forEach((sel) => bodyEl.querySelectorAll(sel).forEach((el) => el.remove()));

  bodyEl.querySelectorAll('.article-body-image-wrapper').forEach((wrapper) => {
    const img = wrapper.querySelector('img');
    if (img && wrapper.parentNode) wrapper.parentNode.replaceChild(img, wrapper);
  });
};

const getTagOverlap = (a, b) => {
  const set = new Set((a || []).map((t) => String(t).toLowerCase()));
  return (b || []).filter((t) => set.has(String(t).toLowerCase())).length;
};

const loadRelatedArticles = async (currentSlug, currentTags) => {
  const listEl = document.getElementById('blog-related-list');
  if (!listEl) return;

  try {
    const res = await fetch('/api/blogs');
    if (!res.ok) throw new Error('fetch failed');
    const payload = await res.json();

    const others = (payload.blogs || []).filter((b) => {
      const slug = b.devSlug || b.localSlug || '';
      return slug !== currentSlug && !b.url?.endsWith(`/${currentSlug}`);
    });

    others.sort((a, b) => {
      const diff = getTagOverlap(currentTags, b.tags) - getTagOverlap(currentTags, a.tags);
      return diff !== 0 ? diff : new Date(b.publishedAt) - new Date(a.publishedAt);
    });

    const top = others.slice(0, 5);
    if (top.length === 0) {
      listEl.innerHTML = '';
      return;
    }

    listEl.innerHTML = top
      .map(
        (b) => `
        <a class="blog-related-card" href="${escapeHtml(b.url)}">
          <h4>${escapeHtml(b.title)}</h4>
          <p>${escapeHtml(formatPublishedDate(b.publishedAt))}${b.readingTimeMinutes ? ` · ${escapeHtml(String(b.readingTimeMinutes))} min` : ''}</p>
        </a>`,
      )
      .join('');
  } catch (_err) {
    const listEl2 = document.getElementById('blog-related-list');
    if (listEl2) listEl2.innerHTML = '';
  }
};

const formatCodeLanguage = (value) => {
  const raw = String(value || '')
    .split(/\s+/)
    .find((name) => /^(language-|lang-)/.test(name));

  if (!raw) {
    return 'Code';
  }

  const language = raw.replace(/^(language-|lang-)/, '');
  return language ? language.toUpperCase() : 'Code';
};

const getCodeBlockText = (pre) =>
  pre.querySelector('code')?.textContent || pre.textContent || '';

const enhanceBlogTables = () => {
  blogDetailBody?.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('blog-table-wrap')) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'blog-table-wrap';
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
      '.highlight__panel, .js-actions-panel, .js-fullscreen-code-action, .image-viewer, .image-overlay, .image-controls, .expand-button, .fit-button, .fullscreen-button, .js-fullsize-image, [data-image-viewer], [data-lightbox]',
    )
    .forEach((node) => node.remove());

  blogDetailBody.querySelectorAll('.article-body-image-wrapper').forEach((node) => {
    node.removeAttribute('class');
    node.removeAttribute('data-image-viewer');
    node.removeAttribute('data-lightbox');
  });

  blogDetailBody.querySelectorAll('img').forEach((image) => {
    if (/^(enter|exit) fullscreen mode$/i.test(image.alt || '')) {
      image.remove();
      return;
    }

    image.loading = 'lazy';
    image.decoding = 'async';
    image.removeAttribute('data-src');
    image.removeAttribute('data-pin-media');
    image.classList.remove('js-fullsize-image');
  });
};

const enhanceBlogCodeBlocks = () => {
  if (!blogDetailBody) {
    return;
  }

  blogDetailBody.querySelectorAll('pre').forEach((pre, index) => {
    if (pre.closest('.blog-code-block')) {
      return;
    }

    const code = pre.querySelector('code');
    const language = formatCodeLanguage(
      `${pre.className || ''} ${code?.className || ''}`,
    );
    const wrapper = document.createElement('div');
    const toolbar = document.createElement('div');
    const label = document.createElement('span');
    const button = createCopyButton(`Copy ${language.toLowerCase()} snippet`);
    const codeId = `blog-code-${blogSlug || 'article'}-${index + 1}`;

    wrapper.className = 'blog-code-block';
    toolbar.className = 'blog-code-toolbar';
    label.className = 'blog-code-language';
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
  const headings = Array.from(blogDetailBody.querySelectorAll('h2, h3')).filter(
    (heading) => heading.textContent.trim(),
  );

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
    blogTocList.innerHTML = '';
    return;
  }

  blogTocList.innerHTML = headings
    .map((heading) => {
      const level = heading.tagName.toLowerCase() === 'h3' ? 'h3' : 'h2';
      return `<a class="blog-toc-link is-${level}" href="#${escapeHtml(
        heading.id,
      )}" data-heading-id="${escapeHtml(heading.id)}">${escapeHtml(
        heading.textContent.trim(),
      )}</a>`;
    })
    .join('');
  blogToc.hidden = false;

  const links = Array.from(blogTocList.querySelectorAll('.blog-toc-link'));
  const setActiveLink = (id) => {
    links.forEach((link) => {
      link.classList.toggle('is-active', link.dataset.headingId === id);
    });
  };

  activeHeadingObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      if (visible[0]?.target.id) {
        setActiveLink(visible[0].target.id);
      }
    },
    { rootMargin: '-18% 0px -68% 0px', threshold: [0, 1] },
  );

  headings.forEach((heading) => activeHeadingObserver.observe(heading));
  setActiveLink(headings[0].id);
};

const renderRelatedArticles = async (currentArticle) => {
  if (!blogRelated || !blogRelatedList) {
    return;
  }

  try {
    const response = await fetch('/api/blogs');
    if (!response.ok) {
      throw new Error(`Failed to load related blogs: ${response.status}`);
    }

    const payload = await response.json();
    const currentTags = new Set(
      (Array.isArray(currentArticle.tags) ? currentArticle.tags : []).map((tag) =>
        String(tag).toLowerCase(),
      ),
    );
    const related = (Array.isArray(payload.blogs) ? payload.blogs : [])
      .filter(
        (blog) =>
          blog.localSlug !== currentArticle.localSlug &&
          blog.devSlug !== currentArticle.devSlug &&
          blog.url !== currentArticle.url,
      )
      .map((blog) => {
        const score = (Array.isArray(blog.tags) ? blog.tags : []).reduce(
          (total, tag) => total + (currentTags.has(String(tag).toLowerCase()) ? 1 : 0),
          0,
        );
        return { ...blog, score };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          new Date(b.publishedAt || 0).getTime() -
            new Date(a.publishedAt || 0).getTime(),
      )
      .slice(0, 4);

    if (!related.length) {
      blogRelated.hidden = true;
      return;
    }

    blogRelatedList.innerHTML = related
      .map(
        (blog) => `<a class="blog-related-card" href="${escapeHtml(blog.url)}">
          <span>${escapeHtml(formatPublishedDate(blog.publishedAt).replace('Published: ', ''))}</span>
          <strong>${escapeHtml(blog.title)}</strong>
        </a>`,
      )
      .join('');
    blogRelated.hidden = false;
  } catch (error) {
    console.error('Unable to load related DEV articles:', error);
    blogRelated.hidden = true;
  }
};

const renderRelatedTools = (article) => {
  if (!blogToolsPanel || !blogToolList) {
    return;
  }

  const text = `${article.title || ''} ${article.description || ''} ${(
    article.tags || []
  ).join(' ')} ${blogDetailBody?.textContent || ''}`.toLowerCase();
  const tools = [
    {
      name: 'JSON Formatter',
      href: '/aruvix.html#json-formatter',
      keywords: ['json', 'api', 'payload', 'response'],
    },
    {
      name: 'API Tester',
      href: '/aruvix.html#api-tester',
      keywords: ['api', 'postman', 'http', 'request', 'endpoint'],
    },
    {
      name: 'Curl Converter',
      href: '/aruvix.html#curl-converter',
      keywords: ['curl', 'terminal', 'http', 'request'],
    },
  ].filter((tool) => tool.keywords.some((keyword) => text.includes(keyword)));

  if (!tools.length) {
    blogToolsPanel.hidden = true;
    blogToolList.innerHTML = '';
    return;
  }

  blogToolList.innerHTML = tools
    .map(
      (tool) => `<a class="blog-tool-link" href="${escapeHtml(tool.href)}">
        <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
        <span>${escapeHtml(tool.name)}</span>
      </a>`,
    )
    .join('');
  blogToolsPanel.hidden = false;
};

blogDetailBody?.addEventListener('click', async (event) => {
  const target = event.target;
  const button =
    target instanceof Element ? target.closest('.copy-code-button') : null;

  if (!button) {
    return;
  }

  const pre = button.closest('.blog-code-block')?.querySelector('pre');

  if (!pre) {
    return;
  }

  try {
    const didCopy = await writeClipboardText(getCodeBlockText(pre));

    if (!didCopy) {
      throw new Error('Clipboard write was rejected.');
    }

    button.classList.add('is-copied');
    button.title = 'Copied';
    button.setAttribute('aria-label', 'Code snippet copied');

    globalThis.setTimeout(() => {
      button.classList.remove('is-copied');
      button.title = 'Copy';
      button.setAttribute('aria-label', 'Copy code snippet');
    }, 1400);
  } catch (error) {
    button.title = 'Copy failed';
    button.setAttribute('aria-label', 'Copy failed');

    globalThis.setTimeout(() => {
      button.title = 'Copy';
      button.setAttribute('aria-label', 'Copy code snippet');
    }, 1400);
  }
});

const renderBlogDetail = async () => {
  if (!blogSlug || !blogDetail) {
    renderBlogList();
    return;
  }

  document.body.classList.add('is-blog-view');

  if (homeContent) {
    homeContent.hidden = true;
  }

  blogDetail.hidden = false;
  showBlogStatus('Loading...');

  try {
    const response = await fetch(`/api/blogs/${encodeURIComponent(blogSlug)}`);

    if (response.status === 404) {
      showBlogStatus('Article not found.');
      return;
    }

    if (!response.ok) {
      throw new Error(`Failed to load blog: ${response.status}`);
    }

    const article = await response.json();
    const tags = Array.isArray(article.tags) ? article.tags : [];

    document.title = `${article.title} | amrishkhan.dev`;
    blogDetailTitle.textContent = article.title;
    if (blogDetailSummary) {
      blogDetailSummary.textContent =
        article.description ||
        'Practical engineering notes, examples, and implementation details.';
    }
    blogDetailMeta.innerHTML = [
      formatPublishedDate(article.publishedAt),
      article.readingTimeMinutes
        ? `${article.readingTimeMinutes} min read`
        : null,
      'Amrishkhan Sheik Abdullah',
    ]
      .filter(Boolean)
      .map((item) => `<span>${escapeHtml(item)}</span>`)
      .join('');
    blogDetailTags.innerHTML = tags
      .map((tag) => `<span>${escapeHtml(tag)}</span>`)
      .join('');

    if (article.coverImage) {
      blogDetailCover.src = article.coverImage;
      blogDetailCover.hidden = false;
    } else {
      blogDetailCover.removeAttribute('src');
      blogDetailCover.hidden = true;
    }

    if (article.bodyHtml) {
      blogDetailBody.innerHTML = article.bodyHtml;
    } else if (article.bodyMarkdown) {
      blogDetailBody.innerHTML = `<pre class="blog-markdown-source">${escapeHtml(
        article.bodyMarkdown,
      )}</pre>`;
    } else {
      blogDetailBody.innerHTML = `<p>${escapeHtml(
        article.message || 'This article is temporarily unavailable.',
      )}</p>`;
    }

    cleanBlogMedia();
    enhanceBlogTables();
    enhanceBlogCodeBlocks();
    buildBlogToc();
    renderRelatedTools(article);
    renderRelatedArticles(article);
    blogDetailStatus.hidden = true;
    blogDetailContent.hidden = false;
    updateScrollProgress();
  } catch (error) {
    console.error('Unable to load DEV blog article:', error);
    showBlogStatus('This article is temporarily unavailable.');
  }
};

renderBlogDetail();

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.animationPlayState = 'running';
      }
    });
  },
  { threshold: 0.12 },
);

document.querySelectorAll('.reveal').forEach((node) => {
  node.style.animationPlayState = 'paused';
  observer.observe(node);
});

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || !entry.target.id) {
        return;
      }

      document.querySelectorAll('.nav-links a').forEach((link) => {
        const href = link.getAttribute('href') || '';
        const isMatch = href === `#${entry.target.id}` || href === `/#${entry.target.id}`;
        link.classList.toggle('is-active', isMatch);
      });
    });
  },
  { threshold: 0.5 },
);

document.querySelectorAll('main section[id]').forEach((section) => {
  sectionObserver.observe(section);
});

const topNav = document.querySelector('.top-nav');

const updateScrollProgress = () => {
  const scrollTop = globalThis.scrollY;
  const scrollHeight =
    document.documentElement.scrollHeight - globalThis.innerHeight;
  const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;

  document.body.style.setProperty('--scroll-progress', `${progress}%`);
  topNav?.classList.toggle('is-scrolled', scrollTop > 10);
  backToTopBtn?.classList.toggle('is-visible', scrollTop > 520);
};

globalThis.addEventListener('scroll', updateScrollProgress, { passive: true });
updateScrollProgress();

backToTopBtn?.addEventListener('click', () => {
  globalThis.scrollTo({ top: 0, behavior: 'smooth' });
});

globalThis.addEventListener('pointermove', (event) => {
  document.body.style.setProperty('--mx', `${event.clientX}px`);
  document.body.style.setProperty('--my', `${event.clientY}px`);
});
