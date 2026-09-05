# Court Rulings Dashboard

A standalone LAN dashboard that surfaces Canadian court rulings with a
filterable, sortable table (title, short summary, court, date, importance)
drawn from the court-rulings pipeline's weekly jsonl snapshots, plus the latest
weekly briefing.

This is the **rulings-table dashboard** extracted from the personal
jarvis-lite home dashboard, published as its own small FastAPI app so it can
be redeployed anywhere.

## What it shows

- **Rulings table** — Title → link out, 180-char summary with full text on
  hover, court (SCC / Federal / Ontario), decision date, and a composite
  **importance score** (color-hot ≥16 / warm ≥10).
- **Filters** — keyword (title/summary), court dropdown, date range, min
  importance. Columns sort on click.
- **Weekly Briefing** — a panel listing the latest pipeline briefing `.md`
  files with previews (also reachable via the tab inside the rulings widget).

The importance score mirrors the pipeline's `classify_ruling()` logic: court
hierarchy (SCC binding > appellate > trial), precedent language (overrule,
Charter, "appeal allowed", framework, etc.), and criminal-law keyword
relevance. This dashboard only reads and renders it — the pipeline computes it.

Data is served read-only; missing sources degrade to a friendly message, not
a 500. Rulings are deduped by URL (weekly snapshots overlap).

## Data source

The dashboard reads the pipeline's jsonl snapshots directly (read-only):

| Env var | Default |
|---|---|
| `COURT_DATA_DIR` | `~/.hermes/court-rulings/data` |
| `COURT_BRIEFING_DIR` | `/mnt/g/My Drive/05_Work/Court Rulings Briefings` |

Point `COURT_DATA_DIR` at wherever your pipeline writes `rulings_*.jsonl` and
it works with no other config.

## Run

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn server.app:app --host 0.0.0.0 --port 8011
```

`--host 0.0.0.0` makes it reachable from other machines on the LAN
(which this dashboard is built for). Open `http://<host>:8011/`.

### systemd (user service)

```ini
[Unit]
Description=Court Rulings Dashboard
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/court-rulings-dashboard
ExecStart=/opt/court-rulings-dashboard/.venv/bin/python -m uvicorn server.app:app --host 0.0.0.0 --port 8011
Restart=always

[Install]
WantedBy=default.target
```

## Notes

- No data files are committed — this is code only. The `.gitignore` keeps the
  jsonl snapshots, DBs, and caches out.
- API contracts: `GET /api/rulings`, `GET /api/briefing`, `GET /api/health`.