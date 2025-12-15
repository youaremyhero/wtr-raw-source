const API = "https://wtr-raw-source.prysillia-l.workers.dev/search";

const queryInput = document.getElementById("query");
const searchButton = document.getElementById("search");
const list = document.getElementById("list");
const hint = document.getElementById("hint");
const status = document.getElementById("status");
const meta = document.getElementById("meta");

status.dataset.tone = "neutral";

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  if (isLoading) {
    status.textContent = "Searching...";
    status.dataset.tone = "pending";
  }
}

function clearUI() {
  list.innerHTML = "";
  meta.innerHTML = "";
}

function renderMeta(query, rawTitle, nu) {
  const lines = [];
  lines.push(`<div><strong>Input:</strong> ${escapeHtml(query)}</div>`);
  if (rawTitle) lines.push(`<div><strong>Resolved raw title:</strong> ${escapeHtml(rawTitle)}</div>`);
  if (nu?.seriesUrl) {
    lines.push(`<div><strong>NovelUpdates:</strong> <a href="${nu.seriesUrl}" target="_blank" rel="noopener">series page</a></div>`);
  }

  meta.innerHTML = lines.join("");
}

function renderNotFound(query, rawTitle, nu) {
  status.textContent = "Not found";
  status.dataset.tone = "warn";
  hint.innerHTML = `<span class="error">No matching source links found.</span>`;
  renderMeta(query, rawTitle, nu);
}

function renderList(matches) {
  const fragment = document.createDocumentFragment();

  for (const match of matches) {
    const li = document.createElement("li");
    li.className = "result-item";
    li.innerHTML = `
      <div class="source">
        <div class="source-link"><a href="${match.canonicalUrl}" target="_blank" rel="noopener">${match.canonicalUrl}</a></div>
        <p class="source-url">Found: <a href="${match.foundUrl}" target="_blank" rel="noopener">${match.foundUrl}</a></p>
      </div>
      <span class="source-tag">${match.source}</span>
    `;
    fragment.appendChild(li);
  }

  list.appendChild(fragment);
}

function render(data) {
  clearUI();

  const { query, rawTitle, nu, matches, notFound } = data;

  if (notFound) {
    renderNotFound(query, rawTitle, nu);
    return;
  }

  status.textContent = `${matches.length} result(s)`;
  status.dataset.tone = "success";
  hint.textContent = rawTitle ? `Showing results for: ${rawTitle}` : "Showing results.";

  renderMeta(query, rawTitle, nu);
  renderList(matches);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

async function doSearch() {
  const query = queryInput.value.trim();
  if (!query) return;

  setLoading(true);
  hint.textContent = "Searching...";
  clearUI();

  try {
    const res = await fetch(`${API}?q=${encodeURIComponent(query)}`, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    render(data);
  } catch (error) {
    status.textContent = "Error";
    status.dataset.tone = "warn";
    hint.innerHTML = `<span class="error">Error:</span> ${escapeHtml(error.message)}`;
  } finally {
    setLoading(false);
  }
}

searchButton.addEventListener("click", doSearch);
queryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") doSearch();
});
