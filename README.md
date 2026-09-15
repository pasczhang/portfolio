# HK Public MMF Portfolio Management System

Monorepo for a Hong Kong SFC-authorized public money-market fund PMS:

- **API**: Python 3.11, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2, QuantLib, Polars
- **Web**: Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, AG-Grid
- **Data**: PostgreSQL 16 + TimescaleDB, Redis for live positions

## Quick start

```bash
docker compose up -d
copy .env.example .env

cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

cd apps/web
pnpm install
pnpm dev
```

## Domain notes

Public HK MMF controls encoded in engines (not only screens):

| Engine | SFC / product constraint |
| --- | --- |
| `WamWalEngine` | WAM ≤ 60d, WAL ≤ 120d (fund-level, overridable) |
| `LiquidityLadderEngine` | Daily / weekly liquid assets |
| `NavEngine` | Official amortized-cost NAV vs shadow MTM + collar |
| `ComplianceEngine` | Concentration, maturity 397d, rating floors |
| `PricingEngine` / `YieldCurveEngine` | QuantLib money-market / curve |

Relational books live in schema `portfolio`; ticks/curves in `market` (Timescale hypertables); rules/breaches in `compliance`.
