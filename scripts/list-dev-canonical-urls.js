const siteUrl = (process.env.SITE_URL || "https://www.amrishkhan.dev").replace(/\/+$/, "");
const devUsername = process.env.DEV_USERNAME || "amrishkhan05";
const perPage = 100;

const absoluteUrl = (pathname) => new URL(pathname, siteUrl).toString();

const fetchDevArticles = async () => {
  const articles = [];

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
        "User-Agent": "amrishkhan.dev canonical helper",
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

  return articles;
};

const main = async () => {
  const articles = await fetchDevArticles();

  articles.forEach((article, index) => {
    const portfolioUrl = absoluteUrl(`/blog/${article.slug}`);

    if (index > 0) {
      console.log("\n---\n");
    }

    console.log(`Title: ${article.title || "Untitled article"}`);
    console.log(`DEV.to: ${article.url || "Not provided by DEV API"}`);
    console.log(`Portfolio: ${portfolioUrl}`);
    console.log(`Published: ${(article.published_at || article.published_timestamp || article.created_at || "Unknown").slice(0, 10)}`);
    console.log("DEV.to front matter:");
    console.log(`canonical_url: ${portfolioUrl}`);
  });
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
