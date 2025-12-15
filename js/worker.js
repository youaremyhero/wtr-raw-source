export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS for GitHub Pages
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    if (url.pathname === "/search") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) return cors(json({ error: "Missing q" }, 400));

      // 1) Resolve raw title if input is likely English
      let rawTitle = q;
      let nu = { seriesUrl: null, resolved: false, associatedNames: [] };

      if (looksEnglish(q)) {
        const nuRes = await resolveViaNovelUpdates(q);
        nu = nuRes;
        if (nuRes.rawTitle) rawTitle = nuRes.rawTitle;
      }

      // 2) Search allowed source domains for raw title
      const matches = await findSourceMatches(rawTitle);

      if (!matches.length) {
        return cors(json({
          query: q,
          rawTitle: (rawTitle !== q ? rawTitle : null),
          nu,
          matches: [],
          notFound: true
        }));
      }

      return cors(json({
        query: q,
        rawTitle: rawTitle,
        nu,
        matches,
        notFound: false
      }));
    }

    return cors(new Response("Not found", { status: 404 }));
  }
};

// -----------------------------
// Config: your allowed sources
// -----------------------------
const SOURCES = [
  { source:"fanqienovel",  re:/https?:\/\/fanqienovel\.com\/page\/(\d+)/i,                        canonical:id=>`https://fanqienovel.com/page/${id}` },
  { source:"qimao",        re:/https?:\/\/www\.qimao\.com\/shuku\/(\d+)/i,                         canonical:id=>`https://www.qimao.com/shuku/${id}` },
  { source:"novel543",     re:/https?:\/\/www\.novel543\.com\/([^\/?#]+)\/?/i,                    canonical:id=>`https://www.novel543.com/${id}/` },
  { source:"uuread",       re:/https?:\/\/www\.uuread\.tw\/([^\/?#]+)\/?/i,                       canonical:id=>`https://www.uuread.tw/${id}` },
  { source:"69shuba",      re:/https?:\/\/www\.69shuba\.com\/book\/(\d+)\.htm/i,                  canonical:id=>`https://www.69shuba.com/book/${id}.htm` },
  { source:"twkan",        re:/https?:\/\/twkan\.com\/book\/(\d+)\.html/i,                        canonical:id=>`https://twkan.com/book/${id}.html` },
  { source:"twbook",       re:/https?:\/\/www\.twbook\.cc\/([^\/?#]+)\/?/i,                       canonical:id=>`https://www.twbook.cc/${id}/` },
  { source:"piaotia",      re:/https?:\/\/www\.piaotia\.com\/bookinfo\/(\d+)\/\1\.html/i,         canonical:id=>`https://www.piaotia.com/bookinfo/${id}/${id}.html` },
  { source:"trxs",         re:/https?:\/\/www\.trxs\.cc\/tongren\/(\d+)\.html/i,                  canonical:id=>`https://www.trxs.cc/tongren/${id}.html` },
  { source:"tongrenshe",   re:/https?:\/\/tongrenshe\.cc\/tongren\/(\d+)\.html/i,                 canonical:id=>`https://tongrenshe.cc/tongren/${id}.html` },
  { source:"uukanshu",     re:/https?:\/\/uukanshu\.cc\/book\/(\d+)\/?/i,                         canonical:id=>`https://uukanshu.cc/book/${id}/` },
  { source:"bixiange",     re:/https?:\/\/m\.bixiange\.me\/book\/(\d+)\/?/i,                      canonical:id=>`https://m.bixiange.me/book/${id}/` },
  { source:"ffxs8",        re:/https?:\/\/www\.ffxs8\.top\/book\/(\d+)\/?/i,                      canonical:id=>`https://www.ffxs8.top/book/${id}/` },
  { source:"biquge_tw",    re:/https?:\/\/www\.biquge\.tw\/book\/(\d+)\.html/i,                   canonical:id=>`https://www.biquge.tw/book/${id}.html` },
  { source:"101kanshu",    re:/https?:\/\/101kanshu\.com\/book\/(\d+)\.html/i,                    canonical:id=>`https://101kanshu.com/book/${id}.html` },
  { source:"drxsw",        re:/https?:\/\/www\.drxsw\.com\/book\/(\d+)\/?/i,                      canonical:id=>`https://www.drxsw.com/book/${id}/` },
];

// -----------------------------
// NovelUpdates resolution
// -----------------------------
async function resolveViaNovelUpdates(englishTitle) {
  // Step A: find a /series/ page by searching DuckDuckGo HTML
  const q = `site:novelupdates.com/series "${englishTitle}"`;
  const ddgHtml = await ddgHtmlSearch(q);
  const seriesUrl = extractFirstUrlMatching(ddgHtml, /https?:\/\/www\.novelupdates\.com\/series\/[^"'<\s]+/i);

  if (!seriesUrl) {
    return { seriesUrl: null, resolved: false, rawTitle: null, associatedNames: [] };
  }

  // Step B: fetch series page and parse "Associated Names"
  const page = await fetchText(seriesUrl);
  const associated = parseAssociatedNames(page);

  // Choose a likely raw title:
  // Prefer names containing CJK characters; otherwise first associated name.
  const rawTitle = pickLikelyRawTitle(associated);

  return { seriesUrl, resolved: !!rawTitle, rawTitle: rawTitle || null, associatedNames: associated };
}

function parseAssociatedNames(html) {
  // Robust-ish parsing without a full DOM:
  // Look for "Associated Names" block and extract list items / line breaks
  const idx = html.toLowerCase().indexOf("associated names");
  if (idx === -1) return [];

  const slice = html.slice(idx, idx + 6000);

  // common patterns: <li>name</li> or <br>name<br>
  const names = new Set();

  // li items
  for (const m of slice.matchAll(/<li[^>]*>(.*?)<\/li>/gis)) {
    const txt = stripTags(m[1]).trim();
    if (txt) names.add(txt);
  }

  // br separated
  const brBlock = slice.match(/associated names[\s\S]*?(<br[\s\/]*>[\s\S]*?)(<\/div>|<\/section>|<\/table>)/i);
  if (brBlock) {
    const parts = brBlock[1]
      .split(/<br[\s\/]*>/i)
      .map(s => stripTags(s).trim())
      .filter(Boolean);
    for (const p of parts) names.add(p);
  }

  return [...names].slice(0, 20);
}

function pickLikelyRawTitle(names) {
  if (!names?.length) return null;
  const cjk = names.find(n => /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(n));
  return cjk || names[0];
}

// -----------------------------
// Search allowed sources
// -----------------------------
function extractResultHrefs(ddgHtml){
  // DuckDuckGo HTML uses <a class="result__a" href="...">
  const hrefs = [];
  for (const m of ddgHtml.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/gi)){
    hrefs.push(m[1]);
  }
  return hrefs;
}

function decodeDuckDuckGoUrl(href){
  // Sometimes DDG uses redirect URLs like /l/?uddg=<encoded>
  try {
    const u = new URL(href, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    // if it’s already an absolute URL, return it
    if (u.protocol.startsWith("http")) return u.href;
  } catch {}
  return null;
}


async function findSourceMatches(rawTitle) {
  const tasks = SOURCES.map(async (s) => {
    const domain = domainFromRe(s.re);
    const q = `"${rawTitle}" site:${domain}`;
    const ddgHtml = await ddgHtmlSearch(q);

    const hrefs = extractResultHrefs(ddgHtml)
      .map(decodeDuckDuckGoUrl)
      .filter(Boolean);

    const foundUrl = hrefs.find(u => s.re.test(u));
    if (!foundUrl) return null;

    const m = foundUrl.match(s.re);
    if (!m) return null;

    const id = m[1];
    return { source: s.source, serieId: id, foundUrl, canonicalUrl: s.canonical(id) };
  });

  const results = (await Promise.all(tasks)).filter(Boolean);
  const seen = new Set();
  return results.filter(r => (seen.has(r.canonicalUrl) ? false : (seen.add(r.canonicalUrl), true)));
}


// -----------------------------
// DuckDuckGo HTML search (no API key)
// -----------------------------
async function ddgHtmlSearch(query) {
  // DuckDuckGo HTML endpoint
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  return await fetchText(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; RawNovelSourceSearch/1.0; +https://github.com/)",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });
}

function extractFirstUrlMatching(html, regex) {
  const m = html.match(regex);
  return m ? m[0] : null;
}

function domainFromRe(re) {
  // Normalize the regex source so we can reliably extract the domain even
  // though it contains lots of escaped characters.
  const unescaped = re.source
    .replace(/\\\./g, ".")
    .replace(/\\\//g, "/");

  // Prefer an explicit domain after the protocol, e.g. https://example.com/
  const direct = unescaped.match(/https?:\/\/(?:www\.)?([^/]+)/i);
  if (direct?.[1]) return direct[1];

  // Fallback: search for something that looks like a domain even if protocol
  // matching failed.
  const loose = unescaped.match(/([a-z0-9-]+\.[a-z0-9.-]+)/i);
  return loose?.[1] || "";
}

// -----------------------------
// Helpers
// -----------------------------
async function fetchText(url, init={}) {
  const res = await fetch(url, init);
  if (!res.ok) return "";
  return await res.text();
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function looksEnglish(s) {
  // heuristic: mostly ASCII letters/numbers/punctuation
  const ascii = (s.match(/[\x20-\x7E]/g) || []).length;
  return ascii / Math.max(1, s.length) > 0.85;
}

function json(obj, status=200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function cors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, headers: h });
}
