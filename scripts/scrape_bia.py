#!/usr/bin/env python3
"""
Scraper BIA — Extraction des annales depuis https://annales-bia.fr/
Structure du site :
  - QCM      : qcm.php?annee={year}&theme={code}
  - Correction: back/correction.php?annee={year}&theme={code}
    → la balise <style> contient "label[for='rep{lettre}{n}']" avec outline vert = bonne réponse
  - Explication: explications.php?id={id}

Usage : python scripts/scrape_bia.py [--skip-explanations]
"""

import argparse
import json
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = "https://annales-bia.fr/"
OUTPUT_JSON = Path("data/questions.json")
IMAGES_DIR = Path("data/images")

DELAY = 1.0          # secondes entre requêtes principales
EXP_DELAY = 0.5     # secondes entre requêtes d'explication
EXP_WORKERS = 3     # parallélisme pour les explications

THEMES = {
    "mto": "meteorologie",
    "amv": "aerodynamique",
    "cda": "aeronefs",
    "nrs": "navigation",
    "his": "histoire",
    "ang": "anglais",
}

YEARS = list(range(2015, 2026))

HEADERS = {
    "User-Agent": "BIA-Training-Scraper/2.0 (educational; annales-bia.fr)",
    "Accept-Language": "fr-FR,fr;q=0.9",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def get(url: str, retries: int = 3, delay: float = DELAY) -> requests.Response | None:
    for attempt in range(retries):
        try:
            time.sleep(delay)
            resp = SESSION.get(url, timeout=20)
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            log.warning("GET %s → %s (essai %d/%d)", url, exc, attempt + 1, retries)
            if attempt < retries - 1:
                time.sleep(DELAY * 2)
    return None


# ---------------------------------------------------------------------------
# Image download
# ---------------------------------------------------------------------------

def download_image(img_src: str, dest_name: str) -> str | None:
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(img_src).suffix or ".gif"
    filename = dest_name + ext
    dest = IMAGES_DIR / filename
    if dest.exists():
        return f"data/images/{filename}"
    img_url = urljoin(BASE_URL, img_src)
    resp = get(img_url, delay=0.3)
    if resp is None:
        return None
    dest.write_bytes(resp.content)
    log.info("    Image : %s", filename)
    return f"data/images/{filename}"


# ---------------------------------------------------------------------------
# Extraction des bonnes réponses depuis le CSS de la page correction
# ---------------------------------------------------------------------------

def parse_answers_from_css(style_text: str) -> dict[int, str]:
    """
    Recherche la règle CSS avec 'outline' (= bonnes réponses) :
      label[for="repa1"], label[for="repc3"], ... { outline: 3px solid green; }
    Retourne {num_question: lettre_majuscule}.
    """
    answers: dict[int, str] = {}
    # Extraire le bloc qui contient outline
    outline_block_re = re.compile(
        r'(label\[for="rep[a-d]\d+"[^}]*?)\{[^}]*outline[^}]*\}',
        re.DOTALL | re.IGNORECASE,
    )
    match = outline_block_re.search(style_text)
    if not match:
        return answers
    selectors = match.group(1)
    # Extraire chaque "repa1", "repb3", etc.
    for m in re.finditer(r'rep([a-d])(\d+)', selectors, re.IGNORECASE):
        letter = m.group(1).upper()
        num = int(m.group(2))
        answers[num] = letter
    return answers


# ---------------------------------------------------------------------------
# Parsing d'une page correction (questions + réponses)
# ---------------------------------------------------------------------------

def scrape_qcm(year: int, theme_code: str) -> list[dict]:
    """Scrape une combinaison année/thème. Retourne liste de dicts question."""
    theme_slug = THEMES[theme_code]
    corr_url = f"{BASE_URL}back/correction.php?annee={year}&theme={theme_code}"

    log.info("  Scraping %d/%s → %s", year, theme_code, corr_url)
    resp = get(corr_url)
    if resp is None:
        log.warning("  Impossible de charger %s", corr_url)
        return []

    soup = BeautifulSoup(resp.text, "html.parser")

    # ---- Bonnes réponses via CSS ----
    style_tag = soup.find("style")
    if not style_tag:
        log.warning("  Pas de <style> pour %d/%s", year, theme_code)
        return []
    answers = parse_answers_from_css(style_tag.get_text())
    if not answers:
        log.warning("  Aucune réponse trouvée dans CSS pour %d/%s", year, theme_code)
        return []
    log.info("    Réponses extraites : %s", answers)

    # ---- Questions ----
    questions = []
    q_divs = soup.find_all("div", id=re.compile(r"^q\d+$"))
    if not q_divs:
        log.warning("  Aucun bloc question pour %d/%s", year, theme_code)
        return []

    for q_div in q_divs:
        num = int(q_div["id"][1:])  # "q3" → 3

        # Texte de la question (supprimer le préfixe "N - " et le lien Explication)
        q_tag = q_div.find("div", class_="q")
        if not q_tag:
            continue

        # Récupérer l'ID d'explication avant de modifier le texte
        expl_link = q_tag.find("a", href=re.compile(r"explications\.php"))
        expl_id: int | None = None
        if expl_link:
            m = re.search(r"id=(\d+)", expl_link["href"])
            if m:
                expl_id = int(m.group(1))
            expl_link.decompose()  # retirer le lien du texte

        raw_text = q_tag.get_text(" ", strip=True)
        # Supprimer le préfixe "1 - ", "12 - ", etc.
        question_text = re.sub(r"^\d+\s*[-–]\s*", "", raw_text).strip()

        # Image dans le bloc question
        img_tag = q_div.find("img")
        image_path = None
        if img_tag and img_tag.get("src") and "deco" not in img_tag["src"]:
            img_name = f"{theme_code}{year}-q{num}"
            image_path = download_image(img_tag["src"], img_name)

        # Choix A/B/C/D
        choices: dict[str, str] = {}
        r_div = q_div.find("div", class_="r")
        if r_div:
            for label in r_div.find_all("label"):
                label_for = label.get("for", "")
                m = re.match(r"rep([a-d])\d+", label_for, re.IGNORECASE)
                if m:
                    letter = m.group(1).upper()
                    # Supprimer le préfixe "A- " du texte du label
                    text = re.sub(r"^[A-D][-–)\s]+", "", label.get_text(" ", strip=True)).strip()
                    choices[letter] = text

        if len(choices) < 2:
            log.warning("    Q%d : moins de 2 choix trouvés, ignorée", num)
            continue

        answer = answers.get(num, "")
        if not answer:
            log.warning("    Q%d : réponse introuvable dans CSS", num)

        questions.append({
            "id": f"{theme_code}-{year}-{num:02d}",
            "theme": theme_slug,
            "year": year,
            "question": question_text,
            "image": image_path,
            "choices": choices,
            "answer": answer,
            "explanation": "",
            "expl_id": expl_id,
        })

    log.info("    %d questions extraites", len(questions))
    return questions


# ---------------------------------------------------------------------------
# Récupération des explications
# ---------------------------------------------------------------------------

def fetch_explanation(expl_id: int) -> str:
    """Retourne le texte d'explication pour un ID donné."""
    url = f"{BASE_URL}explications.php?id={expl_id}"
    resp = get(url, delay=EXP_DELAY)
    if resp is None:
        return ""
    soup = BeautifulSoup(resp.text, "html.parser")
    # L'explication est dans <section>
    section = soup.find("section")
    if not section:
        return ""
    text = section.get_text(" ", strip=True)
    # Supprimer les parties répétitives de l'en-tête
    for prefix in ["Explication de la question", "Les explications sont rédigées par",
                   "Si une erreur s'y cache", "Question", "Explication"]:
        idx = text.find(prefix)
        if idx > 0:
            text = text[idx:]
    # Trouver le bloc "Explication" → garder seulement ce qui suit
    m = re.search(r"Explication\s+(.+?)(?:Cette explication|Ajouter|\Z)", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    return text[:800].strip()


def enrich_explanations(questions: list[dict]) -> None:
    """Ajoute les textes d'explication en parallèle."""
    # Collecter les IDs uniques non encore récupérés
    to_fetch: dict[int, list[int]] = {}  # expl_id → [indices dans questions]
    for i, q in enumerate(questions):
        eid = q.get("expl_id")
        if eid and not q.get("explanation"):
            to_fetch.setdefault(eid, []).append(i)

    if not to_fetch:
        return

    total = len(to_fetch)
    log.info("Récupération de %d explications (parallèle, %d workers)…", total, EXP_WORKERS)
    done = 0

    with ThreadPoolExecutor(max_workers=EXP_WORKERS) as executor:
        future_to_id = {executor.submit(fetch_explanation, eid): eid for eid in to_fetch}
        for future in as_completed(future_to_id):
            eid = future_to_id[future]
            done += 1
            try:
                text = future.result()
            except Exception as exc:
                log.warning("Explication %d → erreur : %s", eid, exc)
                text = ""
            for idx in to_fetch[eid]:
                questions[idx]["explanation"] = text
            if done % 50 == 0 or done == total:
                log.info("  Explications : %d/%d", done, total)


# ---------------------------------------------------------------------------
# Persistance
# ---------------------------------------------------------------------------

def load_existing() -> tuple[list[dict], set[str]]:
    if OUTPUT_JSON.exists():
        data = json.loads(OUTPUT_JSON.read_text(encoding="utf-8"))
        qs = data.get("questions", [])
        ids = {q["id"] for q in qs}
        log.info("Chargement de %d questions existantes", len(qs))
        return qs, ids
    return [], set()


OUTPUT_JS = Path("data/questions.js")


def save(questions: list[dict]) -> None:
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    clean = list(questions)
    payload = {"questions": clean}
    json_str = json.dumps(payload, ensure_ascii=False, indent=2)
    OUTPUT_JSON.write_text(json_str, encoding="utf-8")
    # Génère aussi questions.js pour l'ouverture directe (file://)
    OUTPUT_JS.write_text(f"window.BIA_QUESTIONS = {json_str};\n", encoding="utf-8")
    log.info("Sauvegarde : %d questions → %s + %s", len(clean), OUTPUT_JSON, OUTPUT_JS)


def print_stats(questions: list[dict]) -> None:
    from collections import Counter
    by_theme = Counter(q["theme"] for q in questions)
    by_year  = Counter(q["year"]  for q in questions)
    log.info("=" * 55)
    log.info("STATS")
    for theme, n in sorted(by_theme.items()):
        log.info("  %-35s %d q.", theme, n)
    log.info("Par année : %s", dict(sorted(by_year.items())))
    log.info("TOTAL : %d questions", len(questions))
    log.info("=" * 55)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-explanations", action="store_true",
                        help="Ne pas récupérer les textes d'explication")
    parser.add_argument("--years", nargs="+", type=int, default=YEARS,
                        help="Années à scraper (défaut : 2015-2025)")
    parser.add_argument("--themes", nargs="+", default=list(THEMES.keys()),
                        help="Codes thème à scraper (défaut : tous)")
    args = parser.parse_args()

    # Se placer à la racine du projet
    os.chdir(Path(__file__).parent.parent)
    log.info("Répertoire de travail : %s", Path.cwd())

    questions, existing_ids = load_existing()

    new_count = 0
    for year in sorted(args.years):
        for code in args.themes:
            if code not in THEMES:
                log.warning("Thème inconnu : %s", code)
                continue
            # Vérifier si déjà scrapé (toutes les 20 questions présentes)
            prefix = f"{code}-{year}-"
            already = sum(1 for q in questions if q["id"].startswith(prefix))
            if already >= 18:
                log.info("  %d/%s déjà présent (%d q.), ignoré.", year, code, already)
                continue

            new_qs = scrape_qcm(year, code)
            # Dédupliquer
            for q in new_qs:
                if q["id"] not in existing_ids:
                    questions.append(q)
                    existing_ids.add(q["id"])
                    new_count += 1

            # Sauvegarde incrémentale
            if new_qs:
                save(questions)

    log.info("%d nouvelles questions ajoutées.", new_count)

    if not args.skip_explanations:
        enrich_explanations(questions)
        save(questions)

    print_stats(questions)


if __name__ == "__main__":
    main()
