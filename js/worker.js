export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    if (url.pathname === "/search") {
      const q = (url.searchParams.get("q") || "").trim();
      const debugMode = url.searchParams.get("debug") === "1";

      if (!q) return cors(json({ error: "Missing q" }, 400));

      // 1) Resolve raw title if input likely English
      let rawTitle = q;
      let nu = { seriesUrl: null, resolved: false, rawTitle: null, associatedNames: [] };

      if (looksEnglish(q)) {
        nu = await resolveViaNovelUpdates(q, debugMode);
        if (nu.rawTitle) rawTitle = nu.rawTitle;
      }

      // 2) Search allowed sources for raw title
      const debug = [];
      const matches = await findSourceMatches(rawTitle, { debugMode, debug });

      const payload = {
        query: q,
        rawTitle: rawTitle !== q ? rawTitle : null,
        nu,
        matches,
        notFound: matches.length === 0
      };

      if (debugMode) payload.debug = debug;

      return cors(json(payload));
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
// NovelUpdates resolution
// -----------------------------
async function resolveViaNovelUpdates(englishTitle, debugMode) {
  const query = `site:novelupdates.com/series "${englishTitle}"`;

  const r = await ddgLiteSearchSmart(query);

  const links = extractDuckDuckGoLiteLinks(r.text);
  const external = links.filter(isExternalResultLink);

  const seriesUrl =
    external.find(u => /^https?:\/\/(www\.)?novelupdates\.com\/series\//i.test(u)) || null;

  if (!seriesUrl) {
    return {
      seriesUrl: null,
      resolved: false,
      rawTitle: null,
      associatedNames: [],
      ...(debugMode ? {
        debug: {
          ddg: pickDebug(r),
          extractedLinks: links.length,
          externalLinks: external.length,
          sampleLinks: links.slice(0, 10),
          sampleExternal: external.slice(0, 10)
        }
      } : {})
    };
  }

  const page = await fetchText(seriesUrl);
  const associated = parseAssociatedNames(page);
  const rawTitle = pickLikelyRawTitle(associated);

  const out = { seriesUrl, resolved: !!rawTitle, rawTitle: rawTitle || null, associatedNames: associated };

  if (debugMode) {
    out.debug = {
      ddg: pickDebug(r),
      extractedLinks: links.length,
      externalLinks: external.length,
      sampleExternal: external.slice(0, 10)
    };
  }

  return out;
}

function parseAssociatedNames(html) {
  const idx = html.toLowerCase().indexOf("associated names");
  if (idx === -1) return [];

  const slice = html.slice(idx, idx + 9000);
  const names = new Set();

  // list items
  for (const m of slice.matchAll(/<li[^>]*>(.*?)<\/li>/gis)) {
    const txt = stripTags(m[1]).trim();
    if (txt) names.add(txt);
  }

  // br separated fallback
  const brBlock = slice.match(/associated names[\s\S]*?(<br[\s\/]*>[\s\S]*?)(<\/div>|<\/section>|<\/table>)/i);
  if (brBlock) {
    const parts = brBlock[1]
      .split(/<br[\s\/]*>/i)
      .map(s => stripTags(s).trim())
      .filter(Boolean);
    for (const p of parts) names.add(p);
  }

  return [...names].slice(0, 30);
}

function pickLikelyRawTitle(names) {
  if (!names?.length) return null;
  const cjk = names.find(n => /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(n));
  return cjk || names[0];
}

// -----------------------------
// Search allowed sources
// -----------------------------
async function findSourceMatches(rawTitle, { debugMode, debug }) {
  const tasks = SOURCES.map(async (s) => {
    const domain = domainFromRe(s.re);
    const query = `"${rawTitle}" site:${domain}`;

    const r = await ddgLiteSearchSmart(query);

    const links = extractDuckDuckGoLiteLinks(r.text);
    const external = links.filter(isExternalResultLink);

    if (debugMode) {
      debug.push({
        source: s.source,
        domain,
        query,
        ...pickDebug(r),
        extractedLinks: links.length,
        externalLinks: external.length,
        sampleExternal: external.slice(0, 5)
      });
    }

    if (!r.ok || external.length === 0) return null;

    const foundUrl = external.find(u => s.re.test(u)) || null;
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

  const seen = new Set();
  return results.filter(r => (seen.has(r.canonicalUrl) ? false : (seen.add(r.canonicalUrl), true)));
}

// -----------------------------
// DDG Lite smart: direct -> proxy if needed
//   - proxy if status != 200
//   - proxy if status==200 but no external links
// -----------------------------
async function ddgLiteSearchSmart(query) {
  const direct = await ddgLiteSearchDirect(query);

  if (direct.status === 200) {
    const links = extractDuckDuckGoLiteLinks(direct.text);
    const external = links.filter(isExternalResultLink);
    if (external.length > 0) return direct; // usable
  }

  // fallback
  const proxy = await ddgLiteSearchViaJina(query);

  if (proxy.status === 200) {
    const links = extractDuckDuckGoLiteLinks(proxy.text);
    const external = links.filter(isExternalResultLink);
    if (external.length > 0) return proxy;
  }

  // return "least bad" for debug
  return (proxy.status === 200 ? proxy : direct);
}

async function ddgLiteSearchDirect(query) {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, url: res.url, text, via: "direct" };
}

async function ddgLiteSearchViaJina(query) {
  const target = `http://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const url = `https://r.jina.ai/${target}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, url: res.url, text, via: "proxy" };
}

// -----------------------------
// Link extraction (robust)
//   - href="..."
//   - href='...'
//   - href=unquoted
//   - decode /l/?uddg=...
// -----------------------------
function extractDuckDuckGoLiteLinks(html) {
  const out = [];

  const re = /href=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;

  for (const m of html.matchAll(re)) {
    const href = m[1] || m[2] || m[3];
    if (!href) continue;

    try {
      const u = new URL(href, "https://duckduckgo.com");
      const uddg = u.searchParams.get("uddg");

      if (uddg) {
        out.push(decodeURIComponent(uddg));
      } else if (u.protocol.startsWith("http")) {
        out.push(u.href);
      }
    } catch {
      // ignore
    }
  }

  // de-dupe preserve order
  const seen = new Set();
  return out.filter(x => (seen.has(x) ? false : (seen.add(x), true)));
}

function isExternalResultLink(u) {
  try {
    const host = new URL(u).hostname.replace(/^www\./, "");
    if (host.endsWith("duckduckgo.com")) return false;
    return true;
  } catch {
    return false;
  }
}

function pickDebug(r) {
  return {
    ok: r.ok,
    status: r.status,
    via: r.via || "unknown",
    url: r.url,
    len: r.text.length,
    head: r.text.slice(0, 140)
  };
}

// -----------------------------
// Domain extraction helper
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

// -----------------------------
// Generic helpers
// -----------------------------
async function fetchText(url, init = {}) {
  const res = await fetch(url, init);
  if (!res.ok) return "";
  return await res.text();
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function looksEnglish(s) {
  const ascii = (s.match(/[\x20-\x7E]/g) || []).length;
  return ascii / Math.max(1, s.length) > 0.85;
}

function json(obj, status = 200) {
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
