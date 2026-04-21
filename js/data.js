/**
 * BIA Training — Data loader
 * Loads questions.json and exposes helper functions globally.
 */

const BIAData = (() => {
  const THEMES = {
    meteorologie: {
      label: "Météorologie",
      icon: "🌤️",
      desc: "Atmosphère, nuages, vents, phénomènes météo et leur impact sur le vol.",
      color: "#2e6db4",
    },
    aerodynamique: {
      label: "Aérodynamique et mécanique du vol",
      icon: "🛩️",
      desc: "Portance, traînée, gouvernes, stabilité, performances et pilotage.",
      color: "#1a3a6e",
    },
    aeronefs: {
      label: "Étude des aéronefs et engins spatiaux",
      icon: "🚀",
      desc: "Cellules, moteurs, instruments de bord, hélicoptères, astronautique.",
      color: "#0a1f44",
    },
    navigation: {
      label: "Navigation – Réglementation – Sécurité",
      icon: "🗺️",
      desc: "Cartographie, radionavigation, règles de l'air, espaces aériens, sécurité.",
      color: "#155724",
    },
    histoire: {
      label: "Histoire de l'aéronautique et spatiale",
      icon: "📜",
      desc: "Pionniers, records, grandes dates, conquête spatiale et programme Ariane.",
      color: "#7b3f00",
    },
    anglais: {
      label: "Anglais aéronautique",
      icon: "🇬🇧",
      desc: "Vocabulaire, phraséologie radio, compréhension de textes techniques.",
      color: "#6d28d9",
    },
  };

  let _questions = [];
  let _loaded = false;
  const _callbacks = [];

  function _notify() {
    _callbacks.forEach(fn => fn(_questions));
    _callbacks.length = 0;
  }

  async function load() {
    if (_loaded) return _questions;
    // Fonctionne en file:// (questions.js) ET sur serveur (fetch JSON)
    if (window.BIA_QUESTIONS) {
      _questions = window.BIA_QUESTIONS.questions || [];
    } else {
      try {
        const resp = await fetch("data/questions.json");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        _questions = json.questions || [];
      } catch (e) {
        console.warn("Could not load questions:", e.message);
        _questions = [];
      }
    }
    _loaded = true;
    _notify();
    return _questions;
  }

  function onLoad(fn) {
    if (_loaded) { fn(_questions); } else { _callbacks.push(fn); }
  }

  function byTheme(themeSlug) {
    return _questions.filter(q => q.theme === themeSlug);
  }

  function byThemeAndYear(themeSlug, year) {
    const y = parseInt(year);
    return _questions
      .filter(q => q.theme === themeSlug && q.year === y)
      .sort((a, b) => {
        // Sort by question number (extracted from id like "mto-2024-03")
        const na = parseInt(a.id.split("-").pop()) || 0;
        const nb = parseInt(b.id.split("-").pop()) || 0;
        return na - nb;
      });
  }

  function availableYearsFor(themeSlug) {
    const set = new Set(byTheme(themeSlug).map(q => q.year));
    return [...set].sort((a, b) => b - a); // newest first
  }

  function countByTheme() {
    const counts = {};
    for (const slug of Object.keys(THEMES)) counts[slug] = 0;
    for (const q of _questions) {
      if (counts[q.theme] !== undefined) counts[q.theme]++;
    }
    return counts;
  }

  function countByThemeAndYear(themeSlug, year) {
    return byThemeAndYear(themeSlug, year).length;
  }

  function yearsFor(themeSlug) {
    return availableYearsFor(themeSlug);
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sample(themeSlug, n = 20) {
    const pool = byTheme(themeSlug);
    return shuffle(pool).slice(0, Math.min(n, pool.length));
  }

  function getTheme(slug) { return THEMES[slug]; }
  function allThemes() { return THEMES; }

  load();

  return {
    load, onLoad,
    byTheme, byThemeAndYear,
    availableYearsFor, yearsFor,
    countByTheme, countByThemeAndYear,
    sample, shuffle,
    getTheme, allThemes,
  };
})();
