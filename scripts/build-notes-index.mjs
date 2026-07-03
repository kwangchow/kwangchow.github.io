import fs from "node:fs";
import path from "node:path";

const SOURCE_DIR =
  "/Users/seantaylor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ST-Work/02. SVLT/a) Writing/notes.seantaylor.work/published";
const SITE_URL = "https://seantaylor.work";
const NOTES_URL = "https://notes.seantaylor.work";
const GENERATED_DATE = "2026-07-03";

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w\s/-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function parseMeta(source) {
  const lines = source.split(/\r?\n/);
  const meta = {};
  let bodyStart = 0;
  let metaLines = [];

  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end !== -1) {
      metaLines = lines.slice(1, end);
      bodyStart = end + 1;
    }
  } else {
    const end = lines.indexOf("---");
    if (end !== -1 && end <= 8) {
      metaLines = lines.slice(0, end);
      bodyStart = end + 1;
    }
  }

  for (const line of metaLines) {
    const match = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!match) continue;
    meta[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }

  return { meta, body: lines.slice(bodyStart).join("\n") };
}

function stripMarkdown(value) {
  return String(value)
    .replace(/<blockquote>|<\/blockquote>/gi, " ")
    .replace(/\[([^\]]+)\]\((?:tab:)?[^)]+\)/g, "$1")
    .replace(/\[\^.+?\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/[`*_~=#>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSummary(body) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map(stripMarkdown)
    .filter((paragraph) => paragraph.length > 30 && !paragraph.startsWith("Cheat Sheet"));
  const summary = paragraphs[0] ?? "";
  return summary.length > 210 ? `${summary.slice(0, 207).trim()}...` : summary;
}

function inferTopics(entry) {
  const haystack = `${entry.title} ${entry.summary} ${entry.tags.join(" ")} ${entry.signal || ""}`.toLowerCase();
  const topics = new Set(entry.tags);
  const rules = [
    ["AI and agents", /\b(ai|agent|agents|algorithm|synthetic|slop|automation|model|models|openai|anthropic|prompt|machine)\b/],
    ["playful media", /\b(play|playful|games?|game|ugc|pugc|console|xbox|sandbox|culturematic|meme|memes|toys?|carousel)\b/],
    ["attention and distribution", /\b(attention|distribution|audience|ads?|advertising|youtube|content|clips?|media|traffic|affinity|reach|viral|visibility)\b/],
    ["product strategy", /\b(product|strategy|project|management|consulting|opportunit|tradeoff|innovation|ecosystem|startup|value|market|positioning)\b/],
    ["culture and creativity", /\b(culture|creative|creativity|authentic|taste|art|myth|advice|worldbuilding|meaning|identity|story)\b/]
  ];

  for (const [topic, pattern] of rules) {
    if (pattern.test(haystack)) topics.add(topic);
  }

  return [...topics].filter(Boolean).slice(0, 5);
}

function readEntries() {
  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((file) => file.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  return files
    .map((file) => {
      const source = fs.readFileSync(path.join(SOURCE_DIR, file), "utf8");
      const { meta, body } = parseMeta(source);
      const title = meta.title || path.basename(file, ".md").replaceAll("-", " ");
      const slug = meta.slug || meta.link || slugify(path.basename(file, ".md"));
      const tags = (meta.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.toLowerCase() !== "words")
        .filter(Boolean);
      const date = meta.published_date ? meta.published_date.slice(0, 10) : "";
      const summary = meta.meta_description || firstSummary(body);
      const publish = meta.publish !== "false";
      const discoverable = meta.make_discoverable !== "false";
      const isPage = meta.is_page === "true";

      return {
        title,
        slug,
        url: `${NOTES_URL}/${slug.replace(/^\/+|\/+$/g, "")}/`,
        date,
        summary,
        tags,
        topics: [],
        signal: stripMarkdown(body).slice(0, 1800),
        isPage,
        publish,
        discoverable
      };
    })
    .filter((entry) => entry.publish && entry.discoverable && !entry.isPage)
    .map((entry) => {
      const topics = inferTopics(entry);
      const { signal, ...publicEntry } = entry;
      return { ...publicEntry, topics };
    })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function renderJson(entries) {
  return JSON.stringify(
    {
      generatedAt: GENERATED_DATE,
      source: "Local markdown files for notes.seantaylor.work",
      canonicalArchive: `${NOTES_URL}/`,
      entryCount: entries.length,
      entries
    },
    null,
    2
  );
}

function renderHtml(entries) {
  const topicCounts = new Map();
  for (const entry of entries) {
    for (const topic of entry.topics) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
  }
  const topics = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${SITE_URL}/notes-index.html#webpage`,
    url: `${SITE_URL}/notes-index.html`,
    name: "Sean Taylor Notes Index",
    description:
      "A discovery index of Sean Taylor's public notes archive covering playful media, games, AI, culture, product strategy, attention and innovation.",
    inLanguage: "en",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: entries.length,
      itemListElement: entries.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "BlogPosting",
          headline: entry.title,
          url: entry.url,
          datePublished: entry.date || undefined,
          description: entry.summary || undefined,
          author: {
            "@type": "Person",
            "@id": `${SITE_URL}/#sean-taylor`,
            name: "Sean Taylor"
          },
          ...(entry.topics.length ? { about: entry.topics } : {})
        }
      }))
    }
  };

  const topicMarkup = topics
    .map(([topic, count]) => `<li>${htmlEscape(topic)} <span>${count}</span></li>`)
    .join("\n");
  const entryMarkup = entries
    .map(
      (entry) => `<article>
        <h2><a href="${htmlEscape(entry.url)}">${htmlEscape(entry.title)}</a></h2>
        <p class="meta">${htmlEscape(entry.date || "Undated")} · ${htmlEscape(entry.topics.join(", "))}</p>
        ${entry.summary ? `<p>${htmlEscape(entry.summary)}</p>` : ""}
      </article>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sean Taylor Notes Index | Playful Media, Games, AI &amp; Product Strategy</title>
  <meta name="description" content="Discovery index for Sean Taylor's notes archive: ${entries.length} public posts on playful media, games, AI, culture, product strategy, attention and innovation.">
  <meta name="author" content="Sean Taylor">
  <link rel="canonical" href="${SITE_URL}/notes-index.html">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="alternate" type="application/json" title="Sean Taylor notes index data" href="/notes-index.json">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Sean Taylor Notes Index">
  <meta property="og:description" content="A discovery index for ${entries.length} public notes on playful media, games, AI, culture, product strategy, attention and innovation.">
  <meta property="og:url" content="${SITE_URL}/notes-index.html">
  <meta property="og:image" content="${SITE_URL}/og-image.svg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${SITE_URL}/og-image.svg">
  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 17px;
      line-height: 1.6;
      color: #1a1a1a;
      background: #fafafa;
      -webkit-font-smoothing: antialiased;
    }
    main {
      max-width: 760px;
      margin: 0 auto;
      padding: 4rem 1.5rem 3rem;
    }
    header { margin-bottom: 2.75rem; }
    h1 {
      font-size: 2rem;
      line-height: 1.15;
      margin: 0 0 0.75rem;
    }
    h2 {
      font-size: 1.05rem;
      line-height: 1.35;
      margin: 0 0 0.2rem;
    }
    p { margin: 0 0 1rem; }
    a {
      color: #1a1a1a;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .lede, .meta, footer { color: #555; }
    .topics {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      padding: 0;
      margin: 1.4rem 0 0;
      list-style: none;
    }
    .topics li {
      border: 1px solid #d8d8d8;
      border-radius: 999px;
      padding: 0.2rem 0.65rem;
      font-size: 0.82rem;
      color: #444;
    }
    .topics span { color: #777; }
    article {
      padding: 1rem 0;
      border-top: 1px solid #e0e0e0;
    }
    article p { font-size: 0.95rem; }
    .meta {
      font-size: 0.8rem;
      margin-bottom: 0.4rem;
    }
    footer {
      margin-top: 2.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid #e0e0e0;
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Sean Taylor Notes Index</h1>
      <p class="lede">A discovery index for ${entries.length} public notes published at <a href="${NOTES_URL}/">notes.seantaylor.work</a>. This page points crawlers, answer engines and curious humans toward the canonical notes archive without duplicating the articles.</p>
      <ul class="topics">
${topicMarkup}
      </ul>
    </header>
${entryMarkup}
    <footer>
      <p>Generated from Sean Taylor's local published markdown archive on ${GENERATED_DATE}. Canonical article pages live at <a href="${NOTES_URL}/">notes.seantaylor.work</a>. Machine-readable data: <a href="/notes-index.json">notes-index.json</a>.</p>
      <p><a href="/">Back to seantaylor.work</a></p>
    </footer>
  </main>
</body>
</html>
`;
}

const entries = readEntries();
fs.writeFileSync("notes-index.json", `${renderJson(entries)}\n`);
fs.writeFileSync("notes-index.html", renderHtml(entries));
console.log(`Generated notes-index.html and notes-index.json for ${entries.length} notes.`);
