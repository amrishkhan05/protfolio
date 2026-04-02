/** @format */

const themeToggle = document.querySelector(".theme-toggle");
const themeIcon = themeToggle?.querySelector("i");
const savedTheme = globalThis.localStorage?.getItem("portfolio-theme");
const prefersDark = globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches;

const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";

  themeToggle?.setAttribute("aria-pressed", String(isDark));
  themeToggle?.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");

  if (themeIcon) {
    themeIcon.className = isDark ? "fa-solid fa-sun" : "fa-solid fa-moon";
  }
};

const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
applyTheme(initialTheme);

themeToggle?.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme || "light";
  const next = current === "dark" ? "light" : "dark";

  applyTheme(next);
  globalThis.localStorage?.setItem("portfolio-theme", next);
});

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
  node.style.animationPlayState = "paused";
  observer.observe(node);
});

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || !entry.target.id) {
        return;
      }

      document.querySelectorAll(".nav-links a").forEach((link) => {
        const isMatch = link.getAttribute("href") === `#${entry.target.id}`;
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
};

globalThis.addEventListener("scroll", updateScrollProgress, { passive: true });
updateScrollProgress();

globalThis.addEventListener("pointermove", (event) => {
  document.body.style.setProperty("--mx", `${event.clientX}px`);
  document.body.style.setProperty("--my", `${event.clientY}px`);
});
