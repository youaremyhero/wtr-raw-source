export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    if (url.pathname === "/search") {
      const q = (url.searchParams.get("q") || "").trim();
      const debugMode = url.searchParams.get("debug") === "1";

      if (!q) return cors(json({ error: "Missing q" }, 400));

      // Enforce raw-title-only: reject mostly-English input
      if (looksEnglish(q)) {
        return cors(json({
          error: "Raw titles only",
          message: "Please paste the novel’s original-language (raw) title. English titles are not supported in this version."
        }, 400));
      }

      // Cache whole response
      const cacheKey = new Request(url.toString(), { method: "GET" });
      const cached = await caches.default.match(cacheKey);
      if (cached) return cors(cached);

      const debug = [];
      const matches = await findSourceMatches(q, { debugMode, debug });

      const payload = {
        query: q,
        matches,
        notFound: matches.length === 0
      };

      if (debugMode) payload.debug = debug;

      const res = json(payload);

      // Cache for 30 minutes
      ctx.waitUntil(caches.default.put(cacheKey, res.clone()));

      return cors(res);
    }

    return cors(new Response("Not found", { status: 404 }));
  }
};

// -----------------------------
// Allowed sources
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
// SearXNG backend rotation
// -----------------------------
// Public instances can change; keep a short list and rotate.
// If one consistently fails, remove it.
const SEARX_INSTANCES = [
  "https://searx.be",
  "https://search.bus-hit.me",
  "https://searx.fmac.xyz",
  "https://searx.tiekoetter.com",
];

async function searxSearch(query, { debugMode, label, debug }) {
  const bases = shuffle([...SEARX_INSTANCES]);

  for (const base of bases) {
    const u = new URL("/search", base);
    u.searchParams.set("q", query);
    u.searchParams.set("format", "json");
    u.searchParams.set("language", "zh");
    u.searchParams.set("safesearch", "0");

    try {
      const res = await fetch(u.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json"
        }
      });

      const text = await res.text().catch(() => "");

      if (!res.ok) {
        if (debugMode) debug.push({
          type: "searx",
          label,
          base,
          ok: false,
          status: res.status,
          head: text.slice(0, 140)
        });
        continue;
      }

      let data = null;
      try { data = JSON.parse(text); } catch { data = null; }

      const urls = (data?.results || [])
        .map(r => r?.url)
        .filter(Boolean);

      if (debugMode) debug.push({
        type: "searx",
        label,
        base,
        ok: true,
        status: res.status,
        results: urls.length,
        sample: urls.slice(0, 5)
      });

      if (urls.length) return { ok: true, via: "searx", base, urls };
    } catch (e) {
      if (debugMode) debug.push({
        type: "searx",
        label,
        base,
        ok: false,
        error: String(e).slice(0, 180)
      });
      continue;
    }
  }

  return { ok: false, via: "searx", base: null, urls: [] };
}

// -----------------------------
// Find source matches
// -----------------------------
async function findSourceMatches(rawTitle, { debugMode, debug }) {
  const tasks = SOURCES.map(async (s) => {
    const domain = domainFromRe(s.re);

    // Quote the raw title for exact match where possible
    const query = `"${rawTitle}" site:${domain}`;

    const r = await searxSearch(query, { debugMode, label: s.source, debug });
    if (!r.ok || !r.urls.length) return null;

    // Find first URL matching the source pattern
    const foundUrl = r.urls.find(u => s.re.test(u)) || null;
    if (!foundUrl) return null;

    const m = foundUrl.match(s.re);
    if (!m) return null;

    const id = m[1];
    return {
      source: s.source,
      serieId: id,
      foundUrl,
      canonicalUrl: s.canonical(id)
    };
  });

  const results = (await Promise.all(tasks)).filter(Boolean);

  // De-dupe by canonicalUrl
  const seen = new Set();
  return results.filter(r => (seen.has(r.canonicalUrl) ? false : (seen.add(r.canonicalUrl), true)));
}

// -----------------------------
// Helpers
// -----------------------------
function domainFromRe(re) {
  const unescaped = re.source
    .replace(/\\\./g, ".")
    .replace(/\\\//g, "/");

  const direct = unescaped.match(/https?:\/\/(?:www\.)?([^/]+)/i);
  if (direct?.[1]) return direct[1];

  const loose = unescaped.match(/([a-z0-9-]+\.[a-z0-9.-]+)/i);
  return loose?.[1] || "";
}

function looksEnglish(s) {
  const ascii = (s.match(/[\x20-\x7E]/g) || []).length;
  return ascii / Math.max(1, s.length) > 0.85;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=1800"
    }
  });
}

function cors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, headers: h });
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
