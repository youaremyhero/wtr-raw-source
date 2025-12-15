const searchForm = document.querySelector('.search-form');
const resultsBody = document.querySelector('.results-body');
const resultCount = document.querySelector('[data-binding="result-count"]');
const resultList = resultsBody.querySelector('.results-list');
const templateItem = resultsBody.querySelector('[data-template]');

function clearList() {
  resultList.innerHTML = '';
}

function setState(state, items = []) {
  // Toggle visibility of each placeholder region based on current state
  const states = ['empty', 'not-found', 'found'];
  states.forEach((name) => {
    const target = resultsBody.querySelector(`[data-state="${name}"]`);
    if (target) {
      target.hidden = name !== state;
    }
  });

  if (state === 'found') {
    clearList();
    items.forEach((item) => {
      const clone = templateItem.cloneNode(true);
      clone.removeAttribute('data-template');
      clone.querySelector('[data-binding="source-title"]').textContent = item.title;
      const link = clone.querySelector('[data-binding="source-url"]');
      link.textContent = item.url;
      link.href = item.url;
      clone.hidden = false;
      resultList.appendChild(clone);
    });
    resultCount.textContent = `${items.length} result${items.length === 1 ? '' : 's'} found`;
  } else if (state === 'not-found') {
    clearList();
    resultCount.textContent = 'No matches';
  } else {
    clearList();
    resultCount.textContent = 'No results yet';
  }
}

function performSearch(query) {
  // Replace this mock logic with a real data source lookup
  if (!query) {
    setState('empty');
    return;
  }

  if (query.toLowerCase() === 'none') {
    setState('not-found');
    return;
  }

  const mockResults = [
    {
      title: `${query} — Example Source`,
      url: 'https://example.com/source',
    },
    {
      title: `${query} — Alternate Mirror`,
      url: 'https://example.com/mirror',
    },
  ];

  setState('found', mockResults);
}

searchForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const titleInput = event.target.querySelector('[data-binding="title"]');
  performSearch(titleInput?.value.trim());
});
