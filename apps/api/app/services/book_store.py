"""In-memory live book: seed holdings + blotter mutations (demo, no Postgres)."""

from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from pydantic import BaseModel, Field

from app.models.enums import CouponType
from app.seed_data import SEED_HOLDINGS, SeedHolding, holdings_to_engine, seed_cash
from app.services.engines.mmf_engine import CashLadderEntry, EnginePosition


class BlotterTrade(BaseModel):
    id: str
    trade_time: datetime
    trade_type: str
    counterparty: str
    amount: Decimal
    rate: Decimal
    maturity_date: date
    trader: str
    status: str = "BOOKED"
    security_id: str | None = None


class TradeCreate(BaseModel):
    trade_type: str = Field(pattern="^(BUY|SELL|REPO|DEPOSIT)$")
    counterparty: str
    amount: Decimal = Field(gt=0)
    rate: Decimal = Field(ge=0)
    tenor_days: int = Field(gt=0, le=397)
    trader: str = "PM Desk"
    currency: str = "USD"
    product_type: str | None = None


_holdings: list[SeedHolding] = deepcopy(SEED_HOLDINGS)
_trades: list[BlotterTrade] = []


def _seed_trades(as_of: date) -> list[BlotterTrade]:
    rows = [
        ("BUY", "HSBC", Decimal("12000000"), Decimal("0.041"), 1, "Amy Chen", -0),
        ("DEPOSIT", "Standard Chartered", Decimal("8000000"), Decimal("0.0435"), 7, "Amy Chen", -2),
        ("BUY", "Bank of China", Decimal("15000000"), Decimal("0.044"), 60, "Ken Wong", -15),
        ("BUY", "ICBC", Decimal("10000000"), Decimal("0.046"), 45, "Ken Wong", -10),
        ("BUY", "US Treasury", Decimal("28000000"), Decimal("0.048"), 21, "Amy Chen", -7),
        ("BUY", "HKMA", Decimal("7000000"), Decimal("0.039"), 14, "Priya Shah", -3),
        ("REPO", "SCB", Decimal("5000000"), Decimal("0.038"), 1, "Priya Shah", -1),
        ("SELL", "ICBC", Decimal("2000000"), Decimal("0.045"), 30, "Ken Wong", -5),
    ]
    out: list[BlotterTrade] = []
    for i, (typ, cp, amt, rate, tenor, trader, offset) in enumerate(rows):
        ts = datetime.combine(as_of + timedelta(days=offset), datetime.min.time(), tzinfo=timezone.utc).replace(
            hour=9 + i % 6, minute=15
        )
        out.append(
            BlotterTrade(
                id=f"TRD-{1000 + i}",
                trade_time=ts,
                trade_type=typ,
                counterparty=cp,
                amount=amt,
                rate=rate,
                maturity_date=as_of + timedelta(days=tenor),
                trader=trader,
                status="SETTLED" if offset < -1 else "BOOKED",
            )
        )
    return sorted(out, key=lambda t: t.trade_time, reverse=True)


def reset_book(as_of: date | None = None) -> None:
    global _holdings, _trades
    _holdings = deepcopy(SEED_HOLDINGS)
    _trades = _seed_trades(as_of or date.today())


reset_book()


def live_holdings() -> list[SeedHolding]:
    return _holdings


def live_trades() -> list[BlotterTrade]:
    return list(_trades)


def add_trade(payload: TradeCreate, as_of: date | None = None) -> BlotterTrade:
    as_of = as_of or date.today()
    trade = BlotterTrade(
        id=f"TRD-{uuid4().hex[:8].upper()}",
        trade_time=datetime.now(timezone.utc),
        trade_type=payload.trade_type,
        counterparty=payload.counterparty,
        amount=payload.amount,
        rate=payload.rate,
        maturity_date=as_of + timedelta(days=payload.tenor_days),
        trader=payload.trader,
        status="BOOKED",
        security_id=f"NEW-{payload.counterparty[:4].upper()}-{payload.tenor_days}D",
    )
    _trades.insert(0, trade)
    if payload.trade_type in {"BUY", "DEPOSIT", "REPO"}:
        product = payload.product_type if payload.product_type in {"TD", "NCD", "T-Bill", "REPO"} else None
        if product is None:
            product = "TD" if payload.trade_type in {"DEPOSIT", "REPO"} else "NCD"
            if payload.trade_type == "REPO":
                product = "REPO"
            if "treasury" in payload.counterparty.lower() or payload.counterparty.upper() in {"UST", "HKMA", "US TREASURY"}:
                product = "T-Bill"
        instrument_ccy = f"{payload.currency} " if payload.currency and payload.currency != "USD" else ""
        _holdings.append(
            SeedHolding(
                security_id=trade.security_id or trade.id,
                instrument=f"{instrument_ccy}{payload.counterparty} {payload.trade_type} {payload.tenor_days}D",
                product_type=product,  # type: ignore[arg-type]
                counterparty=payload.counterparty,
                value_date_offset=0,
                maturity_offset=payload.tenor_days,
                coupon_rate=payload.rate,
                coupon_type=CouponType.FIXED,
                face_amount=payload.amount,
                amortized_cost=payload.amount,
                shadow_mtm=payload.amount,
                is_sovereign=product == "T-Bill",
            )
        )
    elif payload.trade_type == "SELL":
        for item in _holdings:
            if item.counterparty.lower() == payload.counterparty.lower() and item.amortized_cost >= payload.amount:
                item.amortized_cost -= payload.amount
                item.face_amount -= payload.amount
                if item.shadow_mtm >= payload.amount:
                    item.shadow_mtm -= payload.amount
                break
    return trade


def live_book(as_of: date) -> tuple[list[EnginePosition], list[CashLadderEntry]]:
    return holdings_to_engine(live_holdings(), as_of), seed_cash(as_of)
