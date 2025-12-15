// js/app.js (FRONTEND)
const API = "https://wtr-raw-source.prysillia-l.workers.dev/search"; 
// ^ replace with your real Worker URL

const qEl = document.getElementById("query");
const btn = document.getElementById("search");
const list = document.getElementById("list");
const hint = document.getElementById("hint");
const status = document.getElementById("status");
const meta = document.getElementById("meta");

function setStatus(text) { status.textContent = text; }
function clearUI(){ list.innerHTML = ""; meta.innerHTML = ""; }

function li(html){
  const el = document.createElement("li");
  el.innerHTML = html;
  list.appendChild(el);
}

async function doSearch(){
  const q = qEl.value.trim();
  if (!q) return;

  btn.disabled = true;
  setStatus("Searching…");
  hint.textContent = "Searching…";
  clearUI();

  try{
    const res = await fetch(`${API}?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

    // meta
    meta.innerHTML = `
      <div><b>Input:</b> ${escapeHtml(data.query)}</div>
      ${data.rawTitle ? `<div><b>Resolved raw title:</b> ${escapeHtml(data.rawTitle)}</div>` : ""}
      ${data.nu?.seriesUrl ? `<div><b>NovelUpdates:</b> <a href="${data.nu.seriesUrl}" target="_blank" rel="noopener">series page</a></div>` : ""}
    `;

    if (data.notFound || !data.matches?.length){
      setStatus("Not found");
      hint.textContent = "No matching source links found.";
      return;
    }

    setStatus(`${data.matches.length} result(s)`);
    hint.textContent = `Showing results for: ${data.rawTitle || data.query}`;

    for (const m of data.matches){
      li(`
        <div class="result-item">
          <div><a href="${m.canonicalUrl}" target="_blank" rel="noopener">${m.canonicalUrl}</a></div>
          <div class="result-sub">Found: <a href="${m.foundUrl}" target="_blank" rel="noopener">${m.foundUrl}</a></div>
          <div class="result-tag">${escapeHtml(m.source)}</div>
        </div>
      `);
    }

  } catch(e){
    setStatus("Error");
    hint.textContent = `Error: ${e.message}`;
  } finally {
    btn.disabled = false;
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

btn.addEventListener("click", doSearch);
qEl.addEventListener("keydown", (e)=>{ if (e.key === "Enter") doSearch(); });
