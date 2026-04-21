/**
 * BIA Training — Revision mode
 * Affiche toutes les questions d'une annale (theme + year) avec corrections visibles.
 */

const revApp = document.getElementById("revision-app");
const revParams = new URLSearchParams(location.search);
const revThemeSlug = revParams.get("theme") || "meteorologie";
const revYearParam  = revParams.get("year")  || null;

const PAGE_SIZE = 20;

let revQuestions = [];
let revSelectedYear = revYearParam || "all";
let revPage = 1;

BIAData.onLoad(() => {
  const theme = BIAData.getTheme(revThemeSlug);
  if (!theme) { revShowError("Thème inconnu."); return; }

  if (revYearParam) {
    revQuestions = BIAData.byThemeAndYear(revThemeSlug, revYearParam);
    revSelectedYear = revYearParam;
  } else {
    revQuestions = BIAData.byTheme(revThemeSlug);
    revSelectedYear = "all";
  }

  if (revQuestions.length === 0) {
    revShowError(`Aucune question disponible pour « ${theme.label} »${revYearParam ? ` en ${revYearParam}` : ""}.`);
    return;
  }

  renderRevision();
});

function filteredQuestions() {
  if (revSelectedYear === "all") return revQuestions;
  return revQuestions.filter(q => String(q.year) === String(revSelectedYear));
}

function renderRevision() {
  const theme = BIAData.getTheme(revThemeSlug);
  const allYears = BIAData.availableYearsFor(revThemeSlug);
  const filtered = filteredQuestions();
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  revPage = Math.min(revPage, totalPages || 1);
  const start = (revPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  revApp.innerHTML = `
    <div class="revision-header">
      <a href="index.html" class="btn btn-ghost btn-sm">← Retour</a>
      <h1 class="revision-title">
        ${theme.icon} ${theme.label} — Révision
      </h1>
      <a href="quiz.html?theme=${revThemeSlug}${revYearParam ? "&year=" + revYearParam : ""}" class="btn btn-primary btn-sm">⚡ Mode entraînement</a>
    </div>

    <div class="revision-controls">
      <label for="rev-year-filter" style="font-size:.9rem;font-weight:600;color:var(--grey-text)">Année :</label>
      <select id="rev-year-filter" class="filter-select" aria-label="Filtrer par année">
        ${revYearParam ? "" : `<option value="all" ${revSelectedYear === "all" ? "selected" : ""}>Toutes les années</option>`}
        ${allYears.map(y => `<option value="${y}" ${String(revSelectedYear) === String(y) ? "selected" : ""}>${y}</option>`).join("")}
      </select>
      <span style="margin-left:auto;font-size:.88rem;color:var(--grey-text)">${filtered.length} question${filtered.length > 1 ? "s" : ""}</span>
    </div>

    <div id="revision-list" aria-live="polite">
      ${pageItems.length === 0
        ? `<div class="empty-state"><div class="icon">🔍</div><p>Aucune question pour cette sélection.</p></div>`
        : pageItems.map((q, idx) => renderRevItem(q, start + idx + 1)).join("")}
    </div>

    ${totalPages > 1 ? renderPagination(revPage, totalPages) : ""}`;

  document.getElementById("rev-year-filter").addEventListener("change", e => {
    revSelectedYear = e.target.value;
    revPage = 1;
    if (revSelectedYear === "all") {
      revQuestions = BIAData.byTheme(revThemeSlug);
    } else {
      revQuestions = BIAData.byThemeAndYear(revThemeSlug, revSelectedYear);
    }
    renderRevision();
  });

  revApp.querySelectorAll(".page-btn[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      revPage = parseInt(btn.dataset.page);
      renderRevision();
      revApp.scrollIntoView({ behavior: "smooth" });
    });
  });
}

function renderRevItem(q, num) {
  const choiceLetters = Object.keys(q.choices);
  return `
  <div class="revision-item">
    <p class="revision-meta">Annale ${q.year} · Q${num}</p>
    ${q.image ? `<div style="margin-bottom:.75rem"><img src="${q.image}" alt="Illustration" style="max-height:220px;border-radius:6px;border:1px solid var(--grey-border)" loading="lazy"></div>` : ""}
    <p class="revision-q">${escRevHtml(q.question)}</p>
    <ul class="revision-choices">
      ${choiceLetters.map(l => `
      <li class="revision-choice ${l === q.answer ? "correct-answer" : ""}">
        ${l === q.answer ? "✓ " : ""}<strong>${l}.</strong> ${escRevHtml(q.choices[l])}
      </li>`).join("")}
    </ul>
    ${q.explanation ? `<p class="revision-explanation">💡 <strong>Correction :</strong> ${escRevHtml(q.explanation)}</p>` : ""}
  </div>`;
}

function renderPagination(current, total) {
  const pages = [];
  const addBtn = (page, label, disabled = false, active = false) =>
    `<button class="page-btn${active ? " active" : ""}" data-page="${page}" ${disabled ? "disabled" : ""} aria-label="Page ${label}" ${active ? 'aria-current="page"' : ""}>${label}</button>`;

  pages.push(addBtn(current - 1, "←", current === 1));
  const range = new Set([1, total]);
  for (let p = Math.max(1, current - 2); p <= Math.min(total, current + 2); p++) range.add(p);
  [...range].sort((a, b) => a - b).forEach((p, i, arr) => {
    if (i > 0 && p - arr[i - 1] > 1) pages.push(`<span style="padding:0 .25rem;color:var(--grey-text)">…</span>`);
    pages.push(addBtn(p, p, false, p === current));
  });
  pages.push(addBtn(current + 1, "→", current === total));

  return `<div class="pagination" role="navigation" aria-label="Pagination">${pages.join("")}</div>`;
}

function revShowError(msg) {
  revApp.innerHTML = `
    <div class="empty-state">
      <div class="icon">⚠️</div>
      <p>${escRevHtml(msg)}</p>
      <a href="index.html" class="btn btn-primary btn-lg">Retour à l'accueil</a>
    </div>`;
}

function escRevHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
