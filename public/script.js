/** @format */

const themeToggle = document.querySelector('.theme-toggle');
const themeIcon = themeToggle?.querySelector('i');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
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
const blogDetailCover = document.getElementById('blog-detail-cover');
const blogDetailTags = document.getElementById('blog-detail-tags');
const blogDetailBody = document.getElementById('blog-detail-body');
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
  document.documentElement.dataset.theme = theme;
  const isDark = theme === 'dark';
  themeColorMeta?.setAttribute(
    'content',
    isDark ? darkThemeColor : lightThemeColor,
  );

  themeToggle?.setAttribute('aria-pressed', String(isDark));
  themeToggle?.setAttribute(
    'aria-label',
    isDark ? 'Switch to light theme' : 'Switch to dark theme',
  );

  if (themeIcon) {
    themeIcon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
};

const savedTheme = safeStorageGet(themeStorageKey);
const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
applyTheme(initialTheme);

const drawKofiWidget = () => {
  if (!globalThis.kofiwidget2) {
    return;
  }

  const theme = document.documentElement.dataset.theme || 'light';
  globalThis.kofiwidget2.init(
    kofiWidgetLabel,
    kofiWidgetColors[theme] || kofiWidgetColors.light,
    kofiWidgetId,
  );
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

themeToggle?.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme || 'light';
  const next = current === 'dark' ? 'light' : 'dark';

  applyTheme(next);
  safeStorageSet(themeStorageKey, next);
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
    blogDetailMeta.textContent = [
      formatPublishedDate(article.publishedAt),
      article.readingTimeMinutes
        ? `${article.readingTimeMinutes} min read`
        : null,
    ]
      .filter(Boolean)
      .join(' • ');
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

    blogDetailStatus.hidden = true;
    blogDetailContent.hidden = false;
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
