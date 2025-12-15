// js/app.js (FRONTEND) — safe version

const WORKER_BASE = "https://wtr-raw-source.prysillia-l.workers.dev"; // your worker
const API = `${WORKER_BASE}/search`;

const qEl = document.getElementById("query");
const btn = document.getElementById("search");
const list = document.getElementById("list");
const hint = document.getElementById("hint");
const status = document.getElementById("status");
const meta = document.getElementById("meta");

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function setLoading(isLoading) {
  btn.disabled = isLoading;
  status.textContent = isLoading ? "Searching…" : status.textContent;
}

function clearResults() {
  list.innerHTML = "";
  meta.innerHTML = "";
}

function addItem(m) {
  const li = document.createElement("li");
  li.innerHTML = `
    <div class="result-item">
      <div><a href="${m.canonicalUrl}" target="_blank" rel="noopener">${esc(m.canonicalUrl)}</a></div>
      <div class="result-sub">Found: <a href="${m.foundUrl}" target="_blank" rel="noopener">${esc(m.foundUrl)}</a></div>
      <div class="result-tag">${esc(m.source)}</div>
    </div>
  `;
  list.appendChild(li);
}

async function doSearch() {
  const q = (qEl.value || "").trim();
  if (!q) return;

  console.log("[search] query =", q);
  console.log("[search] calling =", `${API}?q=${encodeURIComponent(q)}`);

  setLoading(true);
  hint.textContent = "Searching…";
  status.textContent = "Searching…";
  clearResults();

  try {
    const res = await fetch(`${API}?q=${encodeURIComponent(q)}`, { method: "GET" });
    console.log("[search] response status =", res.status);

    const data = await res.json().catch(() => ({}));
    console.log("[search] data =", data);

    if (!res.ok) {
      status.textContent = "Error";
      hint.textContent = data?.error ? `Error: ${data.error}` : `Error: HTTP ${res.status}`;
      return;
    }

    // Meta info
    meta.innerHTML = `
      <div><b>Input:</b> ${esc(data.query ?? q)}</div>
      ${data.rawTitle ? `<div><b>Resolved raw title:</b> ${esc(data.rawTitle)}</div>` : ""}
      ${data.nu?.seriesUrl ? `<div><b>NovelUpdates:</b> <a href="${data.nu.seriesUrl}" target="_blank" rel="noopener">series page</a></div>` : ""}
    `;

    const matches = Array.isArray(data.matches) ? data.matches : [];

    if (!matches.length) {
      status.textContent = "Not found";
      hint.textContent = "No matching source links found.";
      return;
    }

    status.textContent = `${matches.length} result(s)`;
    hint.textContent = `Showing results for: ${data.rawTitle || data.query || q}`;

    for (const m of matches) addItem(m);

  } catch (e) {
    console.error("[search] failed", e);
    status.textContent = "Error";
    hint.textContent = `Error: ${e.message}`;
  } finally {
    setLoading(false);
  }
}

btn.addEventListener("click", doSearch);
qEl.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
