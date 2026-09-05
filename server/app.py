"""court-rulings-dashboard — standalone LAN dashboard for the court-rulings pipeline.

Serves a filterable, sortable table (title, short summary, court, date,
importance) backed by the pipeline's weekly rulings_*.jsonl snapshots, plus the
latest weekly briefing .md files.

Rulings are read-only and deduped by URL (weekly snapshots overlap). The
importance score mirrors the pipeline's classify_ruling() logic (court tier +
precedent language + criminal-law relevance). Missing sources degrade to
{"error": ...} with HTTP 200 (dashboard degradation contract), not a 500.

Paths are env-overridable:
  COURT_DATA_DIR      default ~/.hermes/court-rulings/data
  COURT_BRIEFING_DIR  default "/mnt/g/My Drive/05_Work/Court Rulings Briefings"

Run:  uvicorn server.app:app --host 0.0.0.0 --port 8011
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

COURT_DATA_DIR = Path(os.environ.get(
    "COURT_DATA_DIR",
    str(Path.home() / ".hermes" / "court-rulings" / "data"),
))
COURT_BRIEFING_DIR = Path(os.environ.get(
    "COURT_BRIEFING_DIR", "/mnt/g/My Drive/05_Work/Court Rulings Briefings"))

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="court-rulings-dashboard", docs_url=None, redoc_url=None)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# Importance scoring — mirrors the pipeline's classify_ruling() logic
# (analyze_rulings.py: court hierarchy + precedent keywords + crime keywords)
# as a composite numeric score.
COURT_TIER_SCORE = {
    "scc": 8,     # binding, national precedent
    "onca": 6,    # binding in Ontario
    "fca": 5,     # appellate, federal
    "onsc": 3,    # persuasive
    "onscdc": 3,
    "fct": 2,
    "oncj": 1,
}
COURT_PRECEDENT_KEYWORDS = [
    "overrul", "overturn", "depart from", "new test", "new approach",
    "clarify the law", "established that", "held that", "principle",
    "set out", "articulated", "framework", "standard of review",
    "landmark", "significant", "first time", "interprets",
    "s. 1", "s. 2", "s. 7", "s. 8", "s. 9", "s. 10", "s. 11", "s. 12", "s. 24",
    "charter", "constitutional", "new trial ordered", "appeal allowed",
]
COURT_CRIME_KEYWORDS = [
    "criminal", "sentencing", "evidence", "search", "seizure",
    "charter", "murder", "assault", "robbery", "drug", "weapon",
    "firearm", "impaired", "driving", "dangerous", "offender",
    "bail", "remand", "custody", "probation", "conditional sentence",
    "reasonable doubt", "identification", "confession", "statement",
    "right to counsel", "detention", "arrest", "warrant", "wiretap",
    "dna", "forensic", "expert evidence", "accomplice", "kienapple",
    "young offender", "youth", "gang", "organized crime",
    "human trafficking", "sexual assault", "domestic violence",
    "intimate partner", "peace bond", "surety",
]


def _court_importance_score(item: dict) -> int:
    court = item.get("court") or ""
    text = (
        (item.get("title") or "") + " " + (item.get("description") or "")
    ).lower()
    score = COURT_TIER_SCORE.get(court, 1)
    prec = sum(1 for kw in COURT_PRECEDENT_KEYWORDS if kw in text)
    crime = sum(1 for kw in COURT_CRIME_KEYWORDS if kw in text)
    score += min(prec, 5) * 2        # precedent signals: up to +10
    score += min(crime, 6)           # crime-law relevance: up to +6
    if "appeal allowed" in text or "new trial ordered" in text:
        score += 2                   # changed outcome = more significant
    return score


@app.get("/api/rulings")
def api_rulings() -> dict:
    """Rulings table: title, short summary, court, date, importance, link.

    Reads the pipeline's weekly rulings_*.jsonl snapshots directly (live,
    cheap), dedupes by URL (weekly snapshots overlap heavily), and serves all
    rulings with a composite importance score (court tier + precedent
    language + criminal-law relevance). Filtering/sorting is client-side.
    """
    from email.utils import parsedate_to_datetime
    rulings, seen = [], set()
    try:
        for f in sorted(COURT_DATA_DIR.glob("rulings_*.jsonl")):
            for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                url = item.get("url") or ""
                if not url or url in seen:
                    continue
                seen.add(url)
                date_iso = ""
                try:
                    date_iso = parsedate_to_datetime(item.get("date_published", "")).date().isoformat()
                except (TypeError, ValueError):
                    pass
                rulings.append({
                    "court": item.get("court") or "",
                    "title": (item.get("title") or "").replace(" (CanLII)", ""),
                    "url": url,
                    "date": date_iso,
                    "summary": (item.get("description") or "").replace("\n", " ").strip(),
                    "importance": _court_importance_score(item),
                })
        return {"updated_at": _now_iso(), "count": len(rulings), "rulings": rulings}
    except Exception as exc:
        return {"updated_at": _now_iso(), "error": f"court rulings data unavailable: {exc}"}


@app.get("/api/briefing")
def api_briefing() -> dict:
    """Latest weekly briefing .md files (newest few, with preview)."""
    out = []
    if COURT_BRIEFING_DIR.is_dir():
        files = sorted(COURT_BRIEFING_DIR.glob("briefing_2026*.md"),
                       key=lambda p: p.stat().st_mtime, reverse=True)[:4]
        for p in files:
            try:
                text = p.read_text(errors="replace")[:4000]
            except Exception as exc:
                text = f"(unreadable: {exc})"
            out.append({
                "name": p.name,
                "ts": datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat(),
                "preview": text,
            })
    return {"updated_at": _now_iso(), "briefings": out}


@app.get("/api/health")
def api_health() -> dict:
    return {
        "ok": COURT_DATA_DIR.is_dir(),
        "data_dir": str(COURT_DATA_DIR),
        "updated_at": _now_iso(),
    }


# Static frontend last so /api/* wins.
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")