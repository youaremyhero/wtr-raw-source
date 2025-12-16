const $ = (id) => document.getElementById(id);

const rawTitleEl = $("rawTitle");
const buildBtn = $("buildLinks");
const linksEl = $("searchLinks");

const engineEl = $("engine");
const modeEl = $("mode");
const alsoEl = $("also");
const excludeEl = $("exclude");

const urlEl = $("novelUrl");
const detectBtn = $("detect");

const hintEl = $("hint");
const statusEl = $("status");
const metaEl = $("meta");
const listEl = $("list");

function setStatus(text) { statusEl.textContent = text; }

function clearResults() {
  metaEl.innerHTML = "";
  listEl.innerHTML = "";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/**
 * Supported sources (domains only for search building; regex for URL detection)
 */
const SOURCES = [
  { name: "fanqienovel",  domain: "fanqienovel.com",  re: /^https?:\/\/fanqienovel\.com\/page\/(\d+)/i,                 canonical: (id) => `https://fanqienovel.com/page/${id}` },
  { name: "qimao",        domain: "www.qimao.com",     re: /^https?:\/\/www\.qimao\.com\/shuku\/(\d+)/i,                 canonical: (id) => `https://www.qimao.com/shuku/${id}` },
  { name: "novel543",     domain: "www.novel543.com",  re: /^https?:\/\/www\.novel543\.com\/([^\/?#]+)\/?/i,            canonical: (id) => `https://www.novel543.com/${id}/` },
  { name: "uuread",       domain: "www.uuread.tw",     re: /^https?:\/\/www\.uuread\.tw\/([^\/?#]+)\/?/i,               canonical: (id) => `https://www.uuread.tw/${id}` },
  { name: "69shuba",      domain: "www.69shuba.com",   re: /^https?:\/\/www\.69shuba\.com\/book\/(\d+)\.htm/i,          canonical: (id) => `https://www.69shuba.com/book/${id}.htm` },
  { name: "twkan",        domain: "twkan.com",         re: /^https?:\/\/twkan\.com\/book\/(\d+)\.html/i,                canonical: (id) => `https://twkan.com/book/${id}.html` },
  { name: "twbook",       domain: "www.twbook.cc",     re: /^https?:\/\/www\.twbook\.cc\/([^\/?#]+)\/?/i,               canonical: (id) => `https://www.twbook.cc/${id}/` },
  { name: "piaotia",      domain: "www.piaotia.com",   re: /^https?:\/\/www\.piaotia\.com\/bookinfo\/(\d+)\/\1\.html/i,  canonical: (id) => `https://www.piaotia.com/bookinfo/${id}/${id}.html` },
  { name: "trxs",         domain: "www.trxs.cc",       re: /^https?:\/\/www\.trxs\.cc\/tongren\/(\d+)\.html/i,          canonical: (id) => `https://www.trxs.cc/tongren/${id}.html` },
  { name: "tongrenshe",   domain: "tongrenshe.cc",     re: /^https?:\/\/tongrenshe\.cc\/tongren\/(\d+)\.html/i,         canonical: (id) => `https://tongrenshe.cc/tongren/${id}.html` },
  { name: "uukanshu",     domain: "uukanshu.cc",       re: /^https?:\/\/uukanshu\.cc\/book\/(\d+)\/?/i,                 canonical: (id) => `https://uukanshu.cc/book/${id}/` },
  { name: "bixiange",     domain: "m.bixiange.me",     re: /^https?:\/\/m\.bixiange\.me\/book\/(\d+)\/?/i,              canonical: (id) => `https://m.bixiange.me/book/${id}/` },
  { name: "ffxs8",        domain: "www.ffxs8.top",     re: /^https?:\/\/www\.ffxs8\.top\/book\/(\d+)\/?/i,              canonical: (id) => `https://www.ffxs8.top/book/${id}/` },
  { name: "biquge.tw",    domain: "www.biquge.tw",     re: /^https?:\/\/www\.biquge\.tw\/book\/(\d+)\.html/i,           canonical: (id) => `https://www.biquge.tw/book/${id}.html` },
  { name: "101kanshu",    domain: "101kanshu.com",     re: /^https?:\/\/101kanshu\.com\/book\/(\d+)\.html/i,            canonical: (id) => `https://101kanshu.com/book/${id}.html` },
  { name: "drxsw",        domain: "www.drxsw.com",     re: /^https?:\/\/www\.drxsw\.com\/book\/(\d+)\/?/i,              canonical: (id) => `https://www.drxsw.com/book/${id}/` },
];

/**
 * Engine URL builders (no DuckDuckGo)
 */
const ENGINE_BUILDERS = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  bing:   (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  baidu:  (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`
};

/**
 * Mode-to-query builder:
 * - exact: "RAW" or ("RAW" OR "ALSO")
 * - intitle: intitle:"RAW" (Google/Bing). Baidu doesn’t support intitle consistently; we’ll fallback gracefully.
 * - inurl: inurl:book OR inurl:page OR inurl:shuku etc (engine-dependent; we keep it simple)
 */
function buildQuery({ engine, mode, raw, also, exclude, domain }) {
  const hasAlso = !!also;
  const titleExpr = hasAlso ? `("${raw}" OR "${also}")` : `"${raw}"`;

  const excludes = (exclude || "")
    .split(/\s+/)
    .filter(Boolean)
    .map(w => `-${w}`)
    .join(" ");

  const siteExpr = domain ? `site:${domain}` : `(${SOURCES.map(s => `site:${s.domain}`).join(" OR ")})`;

  // Engine-specific capability handling
  const supportsIntitle = (engine === "google" || engine === "bing");
  const supportsInurl = (engine === "google" || engine === "bing"); // Baidu is inconsistent

  if (mode.startsWith("exact")) {
    return `${titleExpr} ${siteExpr} ${excludes}`.trim();
  }

  if (mode.startsWith("intitle")) {
    if (supportsIntitle) return `intitle:${titleExpr} ${siteExpr} ${excludes}`.trim();
    // Baidu fallback: just exact
    return `${titleExpr} ${siteExpr} ${excludes}`.trim();
  }

  if (mode.startsWith("inurl_book")) {
    if (supportsInurl) {
      // common path hints used by your sources
      const urlHints = `(inurl:book OR inurl:page OR inurl:shuku OR inurl:bookinfo OR inurl:tongren)`;
      return `${titleExpr} ${urlHints} ${siteExpr} ${excludes}`.trim();
    }
    // Baidu fallback: exact + site group
    return `${titleExpr} ${siteExpr} ${excludes}`.trim();
  }

  // default
  return `${titleExpr} ${siteExpr} ${excludes}`.trim();
}

function buildSearchLinks() {
  linksEl.innerHTML = "";
  const raw = rawTitleEl.value.trim();
  const also = alsoEl?.value.trim();
  const exclude = excludeEl?.value.trim();

  if (!raw) {
    linksEl.innerHTML = `<p class="help-text">Enter a raw title to generate links.</p>`;
    hintEl.textContent = "Enter a raw title to begin.";
    setStatus("Idle");
    return;
  }

  const engine = engineEl.value;
  const mode = modeEl.value;

  const makeUrl = ENGINE_BUILDERS[engine];
  if (!makeUrl) {
    linksEl.innerHTML = `<p class="help-text">Unsupported engine selected.</p>`;
    return;
  }

  // Build either ALL sources or PER source
  const isAll = mode.endsWith("_all");

  // Top: one “All sources” button when in _all modes
  if (isAll) {
    const q = buildQuery({ engine, mode, raw, also, exclude, domain: null });
    const href = makeUrl(q);

    const row = document.createElement("div");
    row.className = "link-row";
    row.style.gridTemplateColumns = "1fr";

    row.innerHTML = `
      <div class="link-row-left">
        <div class="link-source">Search ALL supported sources</div>
        <div class="link-domain">${escapeHtml(engine.toUpperCase())} · ${escapeHtml(modeLabel(mode))}</div>
      </div>
      <div class="link-row-right" style="justify-content:flex-start;">
        <a class="link-btn" href="${href}" target="_blank" rel="noopener">Open search</a>
        <button class="link-btn" type="button" data-copy="${escapeHtml(q)}">Copy query</button>
      </div>
      <div class="html-preview">
        <label for="allHtmlPreview">Generated HTML (live)</label>
        <input id="allHtmlPreview" type="text" readonly aria-live="polite" />
      </div>
    `;

    linksEl.appendChild(row);

    const previewInput = $("allHtmlPreview");
    if (previewInput) {
      const template = document.createElement("div");
      const clone = row.cloneNode(true);
      clone.querySelector(".html-preview")?.remove();
      template.appendChild(clone);
      const normalizedHtml = template.innerHTML
        .replace(/>\s+</g, "><")
        .trim();
      previewInput.value = normalizedHtml;
    }
  }

  // Per-source rows (always shown for _each modes; optional for _all as “advanced”)
  if (!isAll) {
    const frag = document.createDocumentFragment();

    for (const s of SOURCES) {
      const q = buildQuery({ engine, mode, raw, also, exclude, domain: s.domain });
      const href = makeUrl(q);

      const row = document.createElement("div");
      row.className = "link-row";
      row.innerHTML = `
        <div class="link-row-left">
          <div class="link-source">${escapeHtml(s.name)}</div>
          <div class="link-domain">${escapeHtml(s.domain)} · ${escapeHtml(engine.toUpperCase())} · ${escapeHtml(modeLabel(mode))}</div>
        </div>
        <div class="link-row-right">
          <a class="link-btn" href="${href}" target="_blank" rel="noopener">Open</a>
          <button class="link-btn" type="button" data-copy="${escapeHtml(q)}">Copy</button>
        </div>
      `;
      frag.appendChild(row);
    }

    linksEl.appendChild(frag);
  }

  // Copy buttons
  linksEl.querySelectorAll("button[data-copy]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const q = btn.getAttribute("data-copy") || "";
      try {
        await navigator.clipboard.writeText(q);
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = "Copy query"), 900);
      } catch {
        alert("Copy failed. Your browser may block clipboard on some pages.");
      }
    });
  });

  hintEl.textContent = "Click a search link, open the novel page, then paste its URL below.";
  setStatus("Links ready");
}

function modeLabel(mode) {
  switch (mode) {
    case "exact_all": return "Exact phrase (ALL)";
    case "intitle_all": return "Title-only (ALL)";
    case "inurl_book_all": return "URL pattern (ALL)";
    case "exact_each": return "Exact phrase (PER source)";
    case "intitle_each": return "Title-only (PER source)";
    case "inurl_book_each": return "URL pattern (PER source)";
    default: return mode;
  }
}

// URL detection (Step 2)
function detectFromUrl(inputUrl) {
  clearResults();

  let url;
  try { url = new URL(inputUrl); }
  catch {
    hintEl.textContent = "That doesn’t look like a valid URL. Please paste the full novel page URL.";
    setStatus("Invalid URL");
    return;
  }

  const href = url.href;
  const matches = [];

  for (const s of SOURCES) {
    const m = href.match(s.re);
    if (!m) continue;
    const id = m[1];
    matches.push({ source: s.name, serieId: id, foundUrl: href, canonicalUrl: s.canonical(id) });
  }

  if (!matches.length) {
    hintEl.textContent = "No supported source pattern matched this URL.";
    setStatus("No match");
    metaEl.innerHTML = `<div class="meta-row"><strong>URL:</strong> ${escapeHtml(href)}</div>`;
    return;
  }

  hintEl.textContent = "";
  setStatus(`${matches.length} match(es)`);
  metaEl.innerHTML = `
    <div class="meta-row"><strong>URL:</strong> ${escapeHtml(href)}</div>
    <div class="meta-row"><strong>Tip:</strong> Copy the canonical link into wtr-lab.</div>
  `;

  for (const m of matches) {
    const li = document.createElement("li");
    li.className = "result-item";
    li.innerHTML = `
      <div class="result-source">${escapeHtml(m.source)}</div>
      <div class="result-id">serie_id: ${escapeHtml(m.serieId)}</div>
      <div class="result-links">
        <a href="${m.canonicalUrl}" target="_blank" rel="noopener">Open canonical</a>
        · <a href="${m.foundUrl}" target="_blank" rel="noopener">Open pasted URL</a>
      </div>
      <div class="result-canon"><code>${escapeHtml(m.canonicalUrl)}</code></div>
    `;
    listEl.appendChild(li);
  }
}

// Events
buildBtn.addEventListener("click", buildSearchLinks);
rawTitleEl.addEventListener("keydown", (e) => { if (e.key === "Enter") buildBtn.click(); });
engineEl.addEventListener("change", () => { if (rawTitleEl.value.trim()) buildSearchLinks(); });
modeEl.addEventListener("change", () => { if (rawTitleEl.value.trim()) buildSearchLinks(); });

detectBtn.addEventListener("click", () => {
  const val = urlEl.value.trim();
  if (!val) {
    hintEl.textContent = "Paste a novel page URL to detect source + serie_id.";
    setStatus("Missing URL");
    return;
  }
  detectFromUrl(val);
});
urlEl.addEventListener("keydown", (e) => { if (e.key === "Enter") detectBtn.click(); });

// Initial state
setStatus("Idle");
