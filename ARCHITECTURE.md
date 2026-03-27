# Crypto Engine – Architecture Overview

> Current version: **v0.4.7r**
> Last updated: 2026-03-08

---

## 1. High-Level Structure

The system has five logical layers:

```
┌─────────────────────────────────────────────────┐
│              Presentation Layer                 │
│         Dashboard (Flask/Gunicorn API + UI)     │
├─────────────────────────────────────────────────┤
│              Execution Layer                    │
│     execution_agent.py  ·  execution ledger     │
├────────────────────┬────────────────────────────┤
│   Engine Layer     │    Stream Layer             │
│   engine.py        │    stream_engine.py         │
│   (periodic)       │    (1-minute packets)       │
├────────────────────┴────────────────────────────┤
│                  Data Layer                     │
│              SQLite (WAL mode)                  │
├─────────────────────────────────────────────────┤
│              Research Layer                     │
│   research/gpu/*  ·  research/rocm_lab/*        │
└─────────────────────────────────────────────────┘
```

---

## 2. Data Layer

**Database:** `crypto_engine.sqlite3` (WAL mode, `synchronous=NORMAL`)

| Table | Purpose |
|---|---|
| `candles` | OHLCV history per symbol/interval. PK: `(ts, symbol, interval)` |
| `decisions` | Engine signal log with position before/after and action label |
| `positions` | Current position state per symbol (`-1` short, `0` flat, `+1` long) |
| `trades` | Closed trade history with PnL multiplier and percent |
| `engine_packets` | 1-minute stream decision packets. PK: `(ts, symbol)` |
| `execution_orders` | Execution agent order lifecycle (submitted → filled) |
| `execution_fills` | Fill records from reconciliation loop |
| `execution_state` | Persisted execution agent runtime state |

The database is the single source of truth. No in-memory state is authoritative across restarts.

Maintenance timers (Ubuntu systemd):
- `crypto-engine-db-backup.timer` — periodic SQLite backup
- `crypto-engine-db-prune.timer` — retention pruning via `prune_db.py`

---

## 3. Engine Layer

**File:** `engine.py`

Runs periodically (default interval controlled by `ENGINE_INTERVAL_SEC` in `run.sh`). Supports BTC, ETH, SOL via `SYMBOL_MAP`. Non-Binance symbols skip engine bootstrap and use stream-only path.

Core responsibilities:
- Fetch 1h/4h candles from Binance and upsert to DB
- Calculate indicators: 7-day and 30-day MAs (1h and 4h), hourly volume, 7d volatility
- Produce `raw_signal` (BUY/SELL/NEUTRAL) via weighted bullish/bearish scoring
- Apply volatility safety brake → `final_signal`
- Call `apply_portfolio()` for symmetric position targeting (+1 long / -1 short)
- Record closed trades and log decisions

Key functions: `decide()`, `apply_portfolio()`, `log_decision()`, `record_trade()`

The engine is deterministic and fully testable without network access (`--no-fetch` flag). All Binance API calls use retry/backoff (`_fetch_with_retry`, 3 attempts, 5s delay). On exhausted retries the engine falls back to cached DB candles and logs a stale-data warning rather than crashing.

**MA naming note:** `ma7_*` / `ma30_*` refer to 7-day and 30-day windows (not 7-period/30-period). At 1h resolution: 168 candles = 7d, 720 = 30d. At 4h resolution: 42 candles ≈ 7d, 90 candles ≈ 15d.

---

## 4. Stream Layer

**File:** `stream_engine.py`

Runs continuously, emitting 1-minute decision packets into `engine_packets`. Supports mixed data sources via per-symbol prefixes (`binance:*`, `yahoo:*`, `stooq:*`).

Packet content includes: state, action, confidence, bias, shadow wallet-flow module, signal guards, and forward-return metadata.

Signal guards (env-configurable):
- TREND_UP buy promotion/demotion buckets
- High-confidence TREND_UP force override
- TREND_UP carry override (preserve long on borderline confidence)
- Countertrend SELL suppression in strong uptrend context
- TREND_DOWN short-cover guard

Auto-heal: `run.sh` watchdog detects stale packets (>120s) and restarts `stream_engine.py` automatically with cooldown.

---

## 5. Execution Layer

**File:** `execution_agent.py`

Manages order lifecycle with a persisted execution ledger. Default mode is **shadow execution** (safe). `binance_spot` path is dryrun + reconciliation realism; signed live placement is not yet active.

Risk guardrails (all env-configurable):
- Kill-switch halt/flatten
- Max absolute position, max orders/hour, max flips/hour
- Min spacing between orders, max notional, max open orders
- Daily loss stop

Deterministic `client_order_id` with DB unique index prevents duplicate submissions on restarts.

---

## 6. Dashboard / API Layer

**Location:** `dashboard/`

| File | Role |
|---|---|
| `app.py` | Flask API + Gunicorn entry point |
| `templates/index.html` | Single-page shell |
| `static/app.js` | Chart rendering and table wiring |
| `static/scorecard_live.js` | Live scorecard progress bars |
| `stream_eval.py` | Stream paper equity + risk analytics |
| `tuning_eval.py` | Confidence calibration buckets |
| `promotion_gate.py` | PASS/FAIL promotion gate logic |

Key API endpoints: `/api/summary`, `/api/portfolio`, `/api/price_series`, `/api/decisions`, `/api/packet_history`, `/api/packet_latest`, `/api/promotion_gate`, `/api/operator_marketflow`, `/api/runtime_health`, `/api/execution_orders`

No business logic lives in JS. The frontend is a thin rendering layer only.

Served via Gunicorn by default; automatic Flask fallback if Gunicorn is unavailable.

---

## 7. Research Layer

**Location:** `research/`

Offline pipeline for turning packet/candle history into alpha hypotheses. Kept strictly separate from the live runtime.

```
research/gpu/
  build_dataset.py           # packet + feature + forward-return training data
  train_alpha_gpu.py         # XGBoost/LightGBM backend race (auto or forced)
  train_ensemble.py          # ensemble trainer
  train_regime_classifier.py
  hyperparameter_sweep.py / bayesian_hyperparameter_sweep.py
  compare_lab_backends.py    # ROCm vs LightGBM per symbol/horizon winner tables
  report_gpu_research.py     # symbol-level metrics + quantile recommendations
  shadow_trading.py
  live_performance_monitor.py

research/rocm_lab/
  train_alpha_rocm.py        # ROCm-only offline trainer (strict lab isolation)
```

ROCm exploration is strictly lab-only. Outputs stay in `research/rocm_lab/*` until gate + walk-forward reconfirm promotion safety.

Recommendation policy enforces configurable alpha + hit-rate floors (`RECOMMEND_MIN_ALPHA_PCT`, `RECOMMEND_MIN_HIT_RATE_PCT`) before emitting threshold promotion suggestions.

---

## 8. Evaluation and Promotion

| Tool | Purpose |
|---|---|
| `evaluate_stream.py` | Offline stream evaluator CLI |
| `evaluate_walkforward.py` | Walk-forward confidence-floor evaluator with regime-aware scoring |
| `export_research_bundle.py` | Reproducible research bundle exporter (packets/candles/analytics/gate) |
| `/api/promotion_gate` | Live PASS/FAIL gate with rollback triggers |
| `logs/promotion_gate_history.csv` | Gate history for trend/ETA analysis |

Promotion flow: walk-forward eval → offline recommendation → manual apply → gate check → rollback if regression.

---

## 9. Operations and Deployment

**Entry point:** `./run.sh`
- Single-instance lock (prevents duplicate supervisors)
- Starts engine, stream engine, and dashboard with child auto-restart
- Passes `STREAM_MARKET_SOURCE` into stream engine
- Stale-packet auto-heal watchdog with cooldown
- Runtime health alerts for stale candles/packets

**Ubuntu deployment** (`deploy/ubuntu/`):
- Systemd services: `crypto-engine-watchdog.timer`, `crypto-engine-nonsleep.service`, DB backup/prune timers, promotion gate log timer
- `sanity_check.sh` / `sanity_check.sh --strict` for pre-break health gating
- `nightly_alpha_cycle.sh` for unattended overnight train/report/compare loops

**Raspberry Pi** (`deploy/pi/`):
- Independent SSH-based health probe + systemd timer
- Observer/alert plane only — no ML workloads

---

## 10. Testing

**Location:** `tests/`

| File | Coverage |
|---|---|
| `test_engine.py` | Signal logic, indicator calculation |
| `test_api.py` | API endpoint responses |
| `test_stream_engine.py` | Stream packet pipeline |
| `test_execution_agent.py` | Order lifecycle, idempotent IDs, kill-switch |
| `test_promotion_gate.py` | Gate PASS/FAIL logic |
| `test_recommendation_policy.py` | Alpha/hit-rate floor enforcement |
| `test_tuning_eval.py` | Confidence calibration |
| `test_dashboard_leftbar_contract.py` | Dashboard data contract |

Run via `pytest -q` or `./dev_check.sh` (includes shell lint, SQLite quick_check, compile check, and API smoke test).

---

## 11. Design Principles

- **Deterministic signal logic** — engine and stream decisions are reproducible
- **Database as state authority** — no authoritative in-memory state across restarts
- **Thin UI layer** — no business logic in JS
- **Explicit structure** — all config via env vars, all thresholds documented
- **Testable components** — engine, stream, execution, and gate are independently testable
- **Safe-by-default execution** — shadow mode on, live routing blocked until explicit promotion
- **Research isolation** — offline pipeline never touches live DB or runtime config directly
