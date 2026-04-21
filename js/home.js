/**
 * BIA Training — Home page
 * Affiche les 6 thèmes avec sélecteur d'année intégré dans chaque carte.
 */

const grid = document.getElementById("themes-grid");

BIAData.onLoad(questions => {
  const themes = BIAData.allThemes();

  if (questions.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="icon">⚠️</div>
        <p>Aucune question trouvée. Lancez d'abord le script <code>scripts/scrape_bia.py</code>.</p>
        <a href="https://annales-bia.fr/" target="_blank" rel="noopener" class="btn btn-primary btn-lg" style="max-width:280px;margin:0 auto">Voir les annales officielles</a>
      </div>`;
    return;
  }

  grid.innerHTML = Object.entries(themes).map(([slug, theme]) => {
    const years = BIAData.availableYearsFor(slug);
    const hasData = years.length > 0;
    const defaultYear = years[0] || "";

    return `
    <div class="theme-card" role="listitem">
      <div class="theme-card-header" style="background:linear-gradient(135deg,${theme.color}dd,${theme.color})">
        <span class="theme-icon" aria-hidden="true">${theme.icon}</span>
        <div>
          <h2>${theme.label}</h2>
          <span class="theme-count" aria-label="${years.length} années disponibles">${years.length} année${years.length > 1 ? "s" : ""}</span>
        </div>
      </div>
      <div class="theme-card-body">
        <p class="theme-desc">${theme.desc}</p>
        ${hasData ? `
        <div class="year-selector" aria-label="Sélection de l'année">
          <label for="year-${slug}" class="year-label">Choisir une année :</label>
          <div class="year-select-row">
            <select id="year-${slug}" class="year-select" aria-label="Année pour ${theme.label}">
              ${years.map(y => `<option value="${y}">${y}</option>`).join("")}
            </select>
            <span class="year-qcount" id="qcount-${slug}">${BIAData.countByThemeAndYear(slug, defaultYear)} questions</span>
          </div>
        </div>
        <div class="card-actions">
          <a href="quiz.html?theme=${slug}&year=${defaultYear}"
             class="btn btn-primary"
             id="btn-quiz-${slug}"
             aria-label="Mode entraînement — ${theme.label}">
            ⚡ Entraînement
          </a>
          <a href="revision.html?theme=${slug}&year=${defaultYear}"
             class="btn btn-secondary"
             id="btn-rev-${slug}"
             aria-label="Mode révision — ${theme.label}">
            📖 Révision
          </a>
        </div>` : `
        <div class="empty-state" style="padding:1rem 0">
          <p style="font-size:.85rem">Aucune question disponible.</p>
        </div>`}
      </div>
    </div>`;
  }).join("");

  // Mettre à jour les liens quand l'année change
  Object.keys(themes).forEach(slug => {
    const sel = document.getElementById(`year-${slug}`);
    if (!sel) return;
    sel.addEventListener("change", () => {
      const year = sel.value;
      const count = BIAData.countByThemeAndYear(slug, year);
      document.getElementById(`qcount-${slug}`).textContent = `${count} question${count > 1 ? "s" : ""}`;
      document.getElementById(`btn-quiz-${slug}`).href = `quiz.html?theme=${slug}&year=${year}`;
      document.getElementById(`btn-rev-${slug}`).href = `revision.html?theme=${slug}&year=${year}`;
    });
  });
});
