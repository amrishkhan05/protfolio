/** @format */

const themeToggle = document.querySelector('.theme-toggle');
const themeIcon = themeToggle?.querySelector('i');
const viewCountNode = document.getElementById('portfolio-view-count');
const ownerViewBadge = document.getElementById('owner-view-badge');
const copyEmailBtn = document.getElementById('copy-email-btn');
const backToTopBtn = document.getElementById('back-to-top');
const ownerMaxViewsKey = 'portfolio-owner-max-views';
let copyResetTimer;
const savedTheme = globalThis.localStorage?.getItem('portfolio-theme');
const prefersDark = globalThis.matchMedia?.(
  '(prefers-color-scheme: dark)',
)?.matches;
const countFormatter = new Intl.NumberFormat('en-US');
const searchParams = new URLSearchParams(globalThis.location.search);

if (searchParams.get('owner') === '1') {
  globalThis.localStorage?.setItem('portfolio-owner-view', '1');
}

if (searchParams.get('owner') === '0') {
  globalThis.localStorage?.removeItem('portfolio-owner-view');
}

const isOwnerViewEnabled =
  globalThis.localStorage?.getItem('portfolio-owner-view') === '1';

if (ownerViewBadge) {
  ownerViewBadge.hidden = !isOwnerViewEnabled;
}

const readOwnerMaxViews = () => {
  const raw = globalThis.localStorage?.getItem(ownerMaxViewsKey);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const writeOwnerMaxViews = (value) => {
  if (!Number.isFinite(value)) {
    return;
  }
  globalThis.localStorage?.setItem(ownerMaxViewsKey, String(value));
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

  themeToggle?.setAttribute('aria-pressed', String(isDark));
  themeToggle?.setAttribute(
    'aria-label',
    isDark ? 'Switch to light theme' : 'Switch to dark theme',
  );

  if (themeIcon) {
    themeIcon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
};

const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
applyTheme(initialTheme);

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
  globalThis.localStorage?.setItem('portfolio-theme', next);
});

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
        const isMatch = link.getAttribute('href') === `#${entry.target.id}`;
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
