/**
 * BIA Training — Quiz mode
 * Charge exactement les questions d'une annale (theme + year).
 */

const app = document.getElementById("quiz-app");
const params = new URLSearchParams(location.search);
const themeSlug = params.get("theme") || "meteorologie";
const yearParam  = params.get("year")  || null;

// --- State ---
let questions = [];
let answers = {};   // index -> chosen letter
let current = 0;
let phase = "quiz"; // "quiz" | "results"

// --- Init ---
BIAData.onLoad(() => {
  const theme = BIAData.getTheme(themeSlug);
  if (!theme) { showError("Thème inconnu."); return; }

  if (yearParam) {
    questions = BIAData.byThemeAndYear(themeSlug, yearParam);
    if (questions.length === 0) {
      showError(`Aucune question pour « ${theme.label} » en ${yearParam}.`);
      return;
    }
  } else {
    // Fallback : tirage aléatoire toutes années confondues
    questions = BIAData.sample(themeSlug, 20);
    if (questions.length === 0) {
      showError(`Aucune question disponible pour « ${theme.label} ».`);
      return;
    }
  }

  render();
});

// --- Render dispatcher ---
function render() {
  if (phase === "results") renderResults();
  else renderQuestion();
}

// =========================================================
// Question view
// =========================================================
function renderQuestion() {
  const q = questions[current];
  const total = questions.length;
  const theme = BIAData.getTheme(themeSlug);
  const progress = Math.round(((current + 1) / total) * 100);
  const answered = answers[current];
  const yearLabel = yearParam ? ` · ${yearParam}` : "";

  app.innerHTML = `
    <div class="quiz-header-bar">
      <div class="quiz-meta">
        <span class="quiz-counter">Question <strong>${current + 1}</strong> / ${total}</span>
        <span class="quiz-theme-badge">${theme.icon} ${theme.label}${yearLabel}</span>
      </div>
      <div class="progress-bar" role="progressbar" aria-valuenow="${current + 1}" aria-valuemin="1" aria-valuemax="${total}" aria-label="Progression">
        <div class="progress-fill" style="width:${progress}%"></div>
      </div>
    </div>

    <div class="question-card" id="question-card">
      ${q.image ? `<div class="question-image"><img src="${q.image}" alt="Illustration de la question" loading="lazy"></div>` : ""}
      <p class="question-text" id="question-text">${escHtml(q.question)}</p>

      <ul class="choices-list" role="radiogroup" aria-labelledby="question-text">
        ${Object.entries(q.choices).map(([letter, text]) => `
        <li class="choice-item">
          <input type="radio" name="choice" id="choice-${letter}" value="${letter}"
            class="choice-input"
            ${answered === letter ? "checked" : ""}
            aria-label="Réponse ${letter} : ${escHtml(text)}">
          <label for="choice-${letter}" class="choice-label" id="label-${letter}">
            <span class="choice-letter" aria-hidden="true">${letter}</span>
            <span class="choice-text">${escHtml(text)}</span>
          </label>
        </li>`).join("")}
      </ul>
    </div>

    <nav class="quiz-nav" aria-label="Navigation quiz">
      <button class="btn btn-ghost" id="btn-prev" ${current === 0 ? "disabled" : ""} aria-label="Question précédente">
        ← Précédent
      </button>
      <span style="color:var(--grey-text);font-size:.85rem">${countAnswered()} / ${total} répondues</span>
      <button class="btn btn-primary" id="btn-next" ${!answered ? "disabled" : ""} aria-label="${current === total - 1 ? "Terminer le quiz" : "Question suivante"}">
        ${current === total - 1 ? "Terminer ✓" : "Suivant →"}
      </button>
    </nav>`;

  // Events
  app.querySelectorAll(".choice-input").forEach(input => {
    input.addEventListener("change", () => {
      answers[current] = input.value;
      document.getElementById("btn-next").disabled = false;
    });
  });

  document.getElementById("btn-prev").addEventListener("click", () => { current--; render(); });
  document.getElementById("btn-next").addEventListener("click", () => {
    if (current === total - 1) { phase = "results"; }
    else { current++; }
    render();
  });
}

// =========================================================
// Results view
// =========================================================
function renderResults() {
  const total = questions.length;
  let correct = 0;
  questions.forEach((q, i) => { if (answers[i] === q.answer) correct++; });
  const pct = Math.round((correct / total) * 100);
  const { label: feedbackLabel, cls } = getFeedback(pct);
  const theme = BIAData.getTheme(themeSlug);
  const yearLabel = yearParam ? ` — Annale ${yearParam}` : "";

  app.innerHTML = `
    <div class="results-card">
      <p class="results-annale">${theme.icon} ${theme.label}${yearLabel}</p>
      <div class="score-big" aria-label="${correct} bonnes réponses sur ${total}">
        ${correct}<span>/${total}</span>
      </div>
      <p class="score-label">bonnes réponses</p>
      <p class="score-percent">${pct}%</p>
      <span class="feedback-badge ${cls}">${feedbackLabel}</span>

      <div class="results-actions">
        ${yearParam ? `<button class="btn btn-orange btn-lg" id="btn-retry">🔄 Recommencer cette annale</button>` : ""}
        <button class="btn btn-primary btn-lg" id="btn-detail">📋 Voir le détail</button>
        <a href="index.html" class="btn btn-ghost btn-lg">🏠 Accueil</a>
      </div>
    </div>

    <div id="detail-section" hidden aria-live="polite">
      <h2 class="section-title">📋 Détail des réponses</h2>
      <ul class="detail-list">
        ${questions.map((q, i) => {
          const given = answers[i] || "—";
          const ok = given === q.answer;
          return `
          <li class="detail-item ${ok ? "detail-correct" : "detail-wrong"}">
            <span class="detail-icon" aria-hidden="true">${ok ? "✅" : "❌"}</span>
            <div>
              <p class="detail-question">${escHtml(q.question)}</p>
              <p class="detail-answers">
                Votre réponse : <strong>${given}${q.choices[given] ? " — " + escHtml(q.choices[given]) : ""}</strong><br>
                ${!ok ? `Bonne réponse : <strong style="color:var(--success)">${q.answer} — ${escHtml(q.choices[q.answer] || "")}</strong>` : ""}
              </p>
              ${q.explanation ? `<p class="detail-explanation">💡 ${escHtml(q.explanation)}</p>` : ""}
            </div>
          </li>`;
        }).join("")}
      </ul>
    </div>`;

  if (yearParam) {
    document.getElementById("btn-retry").addEventListener("click", () => {
      questions = BIAData.byThemeAndYear(themeSlug, yearParam);
      answers = {}; current = 0; phase = "quiz";
      render();
    });
  }

  document.getElementById("btn-detail").addEventListener("click", () => {
    const sec = document.getElementById("detail-section");
    const btn = document.getElementById("btn-detail");
    const hidden = sec.hidden;
    sec.hidden = !hidden;
    btn.textContent = hidden ? "🙈 Masquer le détail" : "📋 Voir le détail";
    if (!sec.hidden) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// =========================================================
// Helpers
// =========================================================
function countAnswered() { return Object.keys(answers).length; }

function getFeedback(pct) {
  if (pct >= 90) return { label: "🏆 Excellent !",         cls: "feedback-excellent" };
  if (pct >= 70) return { label: "👍 Bien !",              cls: "feedback-good" };
  if (pct >= 50) return { label: "📚 Peut mieux faire",    cls: "feedback-ok" };
  return           { label: "💪 À retravailler",           cls: "feedback-retry" };
}

function showError(msg) {
  app.innerHTML = `
    <div class="empty-state">
      <div class="icon">⚠️</div>
      <p>${escHtml(msg)}</p>
      <a href="index.html" class="btn btn-primary btn-lg">Retour à l'accueil</a>
    </div>`;
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
