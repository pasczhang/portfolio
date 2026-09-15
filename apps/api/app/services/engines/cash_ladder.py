"""Cash ladder: holiday-adjusted cash flows, SFC time buckets, cumulative gap."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal
from urllib.parse import quote

from pydantic import BaseModel

from app.seed_data import SEED_HOLDINGS

Q = Decimal("0.01")
DLA_FLOOR = Decimal("10")
WLA_FLOOR = Decimal("30")
AS_OF_DEFAULT = date(2026, 9, 15)

Cal = Literal["HK", "US"]
FlowKind = Literal["MATURITY", "COUPON", "DVP", "SUBSCRIPTION", "REDEMPTION", "FEE"]
Direction = Literal["IN", "OUT"]

HK_HOLIDAYS = {
    date(2026, 1, 1),
    date(2026, 2, 17),
    date(2026, 2, 18),
    date(2026, 2, 19),
    date(2026, 4, 3),
    date(2026, 4, 6),
    date(2026, 4, 7),
    date(2026, 5, 1),
    date(2026, 5, 25),
    date(2026, 6, 19),
    date(2026, 7, 1),
    date(2026, 9, 25),
    date(2026, 10, 1),
    date(2026, 10, 19),
    date(2026, 12, 25),
    date(2026, 12, 28),
    date(2027, 1, 1),
}
US_HOLIDAYS = {
    date(2026, 1, 1),
    date(2026, 1, 19),
    date(2026, 2, 16),
    date(2026, 5, 25),
    date(2026, 6, 19),
    date(2026, 7, 3),
    date(2026, 9, 7),
    date(2026, 10, 12),
    date(2026, 11, 11),
    date(2026, 11, 26),
    date(2026, 12, 25),
    date(2027, 1, 1),
}

SFC_BUCKETS = (
    ("ON / T+0", 0, 0),
    ("1D / T+1", 1, 1),
    ("2-7D / 1W", 2, 7),
    ("8-30D / 1M", 8, 30),
    ("31-90D / 3M", 31, 90),
    ("91-180D / 6M", 91, 180),
    (">180D / 1Y", 181, 10_000),
)
CHART_BUCKETS = (
    ("Today", 0, 0),
    ("T+1", 1, 1),
    ("T+2", 2, 2),
    ("T+3", 3, 3),
    ("1W", 4, 7),
    ("2W", 8, 14),
    ("1M", 15, 30),
    ("2M", 31, 60),
    ("3M", 61, 90),
    ("6M+", 91, 10_000),
)


def _month_end(d: date) -> date:
    nxt_month = d.month % 12 + 1
    nxt_year = d.year + (1 if d.month == 12 else 0)
    return date(nxt_year, nxt_month, 1) - timedelta(days=1)


def _money(value: Decimal) -> Decimal:
    return value.quantize(Q, rounding=ROUND_HALF_UP)


def holidays_for(cal: Cal) -> set[date]:
    return HK_HOLIDAYS if cal == "HK" else US_HOLIDAYS


def is_weekend(d: date) -> bool:
    return d.weekday() >= 5


def is_holiday(d: date, cal: Cal) -> bool:
    return d in holidays_for(cal)


def is_business_day(d: date, cal: Cal) -> bool:
    return not is_weekend(d) and not is_holiday(d, cal)


def modified_following(d: date, cal: Cal) -> date:
    """Roll to next business day; if that crosses the month, roll back to last business day."""
    adj = d
    while not is_business_day(adj, cal):
        adj += timedelta(days=1)
    if adj.month != d.month or adj.year != d.year:
        adj = d
        while not is_business_day(adj, cal):
            adj -= timedelta(days=1)
    return adj


def calendar_days(as_of: date, d: date) -> int:
    return (d - as_of).days


def business_days_until(as_of: date, d: date, cal: Cal = "HK") -> int:
    if d <= as_of:
        return 0
    n = 0
    cur = as_of
    while cur < d:
        cur += timedelta(days=1)
        if is_business_day(cur, cal):
            n += 1
    return n


def sfc_bucket(days: int) -> str:
    for name, lo, hi in SFC_BUCKETS:
        if lo <= days <= hi:
            return name
    return SFC_BUCKETS[-1][0]


def chart_bucket(days: int) -> str:
    for name, lo, hi in CHART_BUCKETS:
        if lo <= days <= hi:
            return name
    return CHART_BUCKETS[-1][0]


class CashEvent(BaseModel):
    event_id: str
    value_date: date
    adjusted_date: date
    rolled: bool
    calendar: Cal
    kind: FlowKind
    direction: Direction
    amount: Decimal
    signed_amount: Decimal
    currency: str = "USD"
    security_id: str
    name: str
    counterparty: str
    status: str
    bucket_sfc: str
    bucket_chart: str
    days: int
    notes: str = ""


class DailyPack(BaseModel):
    date: date
    net: Decimal
    inflow: Decimal
    outflow: Decimal
    cumulative: Decimal
    event_count: int
    holiday_hk: bool
    holiday_us: bool
    weekend: bool
    deficit: bool
    events: list[CashEvent]


class TimeBucketRow(BaseModel):
    bucket: str
    inflow: Decimal
    outflow: Decimal
    net: Decimal
    cumulative: Decimal
    maturity: Decimal = Decimal("0")
    coupon: Decimal = Decimal("0")
    subscription: Decimal = Decimal("0")
    dvp: Decimal = Decimal("0")
    redemption: Decimal = Decimal("0")
    fee: Decimal = Decimal("0")


class DlaWlaDay(BaseModel):
    date: date
    cash: Decimal
    dla_pct: Decimal
    wla_pct: Decimal
    dla_ok: bool
    wla_ok: bool


class ReinvestIdea(BaseModel):
    security_id: str
    name: str
    counterparty: str
    asset_class: str
    amount: Decimal
    adjusted_date: date
    days: int
    suggestion: str
    workbench_href: str


class CashLadderSnapshot(BaseModel):
    as_of: date
    fund_code: str = "BAM-USD-MMF"
    currency: str = "USD"
    opening_cash: Decimal
    available_cash: Decimal
    net_7d: Decimal
    reinvestment_3d: Decimal
    deficit: bool
    kpis: dict[str, str]
    events: list[CashEvent]
    days: list[DailyPack]
    sfc_buckets: list[TimeBucketRow]
    chart_buckets: list[TimeBucketRow]
    dla_wla: list[DlaWlaDay]
    reinvest: list[ReinvestIdea]
    calendar_month: str
    holidays: list[dict[str, str]]


def _event(
    *,
    event_id: str,
    raw: date,
    cal: Cal,
    as_of: date,
    kind: FlowKind,
    direction: Direction,
    amount: Decimal,
    security_id: str,
    name: str,
    counterparty: str,
    status: str,
    notes: str = "",
    currency: str = "USD",
) -> CashEvent:
    adj = modified_following(raw, cal)
    days = max(calendar_days(as_of, adj), 0)
    signed = amount if direction == "IN" else -amount
    return CashEvent(
        event_id=event_id,
        value_date=raw,
        adjusted_date=adj,
        rolled=adj != raw,
        calendar=cal,
        kind=kind,
        direction=direction,
        amount=_money(amount),
        signed_amount=_money(signed),
        currency=currency,
        security_id=security_id,
        name=name,
        counterparty=counterparty,
        status=status,
        bucket_sfc=sfc_bucket(days),
        bucket_chart=chart_bucket(days),
        days=days,
        notes=notes,
    )


def demo_cash_events(as_of: date) -> tuple[list[CashEvent], Decimal, Decimal]:
    """Holdings maturities from the live seed book + near-term overlay required by the spec."""
    events: list[CashEvent] = []
    opening = Decimal("15200000")
    aum = Decimal("120000000")

    for item in SEED_HOLDINGS:
        raw = as_of + timedelta(days=item.maturity_offset)
        cal: Cal = "HK" if item.counterparty in {"HKMA", "Bank of China"} else "US"
        if item.counterparty in {"HSBC", "Standard Chartered", "ICBC"}:
            cal = "HK" if item.product_type in {"TD", "NCD"} else "US"
        principal = item.face_amount + (item.face_amount * item.coupon_rate * Decimal("2") / Decimal("365") if item.product_type == "TD" else Decimal("0"))
        events.append(
            _event(
                event_id=f"mat-{item.security_id}",
                raw=raw,
                cal=cal,
                as_of=as_of,
                kind="MATURITY",
                direction="IN",
                amount=_money(principal),
                security_id=item.security_id,
                name=item.instrument,
                counterparty=item.counterparty,
                status="Scheduled",
                notes="Principal maturity from portfolio holdings",
            )
        )

    events.extend(
        [
            _event(
                event_id="mat-NCD-BOCHK-ROLL",
                raw=as_of + timedelta(days=1),
                cal="HK",
                as_of=as_of,
                kind="MATURITY",
                direction="IN",
                amount=Decimal("30000000"),
                security_id="NCD-BOCHK-ROLL",
                name="BOCHK 3M HKD NCD (rolling)",
                counterparty="Bank of China",
                status="Scheduled",
                notes="Near-term NCD principal",
                currency="HKD",
            ),
            _event(
                event_id="mat-NCD-HSBC-2D",
                raw=as_of + timedelta(days=2),
                cal="HK",
                as_of=as_of,
                kind="MATURITY",
                direction="IN",
                amount=Decimal("18000000"),
                security_id="NCD-HSBC-2D",
                name="HSBC 1M USD NCD",
                counterparty="HSBC",
                status="Scheduled",
                notes="Near-term NCD principal",
            ),
            _event(
                event_id="cpn-NCD-ICBC-45",
                raw=as_of + timedelta(days=3),
                cal="HK",
                as_of=as_of,
                kind="COUPON",
                direction="IN",
                amount=Decimal("115000"),
                security_id="NCD-ICBC-45",
                name="ICBC Negotiable CD",
                counterparty="ICBC",
                status="Accrued",
                notes="Quarterly coupon receipt",
            ),
            _event(
                event_id="cpn-NCD-BOC-60",
                raw=as_of + timedelta(days=11),
                cal="HK",
                as_of=as_of,
                kind="COUPON",
                direction="IN",
                amount=Decimal("164384"),
                security_id="NCD-BOC-60",
                name="Bank of China NCD FRN",
                counterparty="Bank of China",
                status="Accrued",
                notes="Coupon date falls on weekend/holiday; Modified Following",
            ),
            _event(
                event_id="dvp-TB-UST-BUY",
                raw=as_of + timedelta(days=2),
                cal="US",
                as_of=as_of,
                kind="DVP",
                direction="OUT",
                amount=Decimal("42000000"),
                security_id="TB-UST-NEW",
                name="US Treasury Bill 3M (unsettled buy)",
                counterparty="US Treasury",
                status="Unsettled T+2",
                notes="DVP purchase vs Fedwire",
            ),
            _event(
                event_id="ta-sub-1",
                raw=as_of + timedelta(days=5),
                cal="HK",
                as_of=as_of,
                kind="SUBSCRIPTION",
                direction="IN",
                amount=Decimal("8000000"),
                security_id="TA-SUB",
                name="Institutional subscription",
                counterparty="Transfer Agent",
                status="TA forecast",
            ),
            _event(
                event_id="ta-red-1",
                raw=as_of + timedelta(days=2),
                cal="HK",
                as_of=as_of,
                kind="REDEMPTION",
                direction="OUT",
                amount=Decimal("40000000"),
                security_id="TA-RED",
                name="Large redemption notice",
                counterparty="Transfer Agent",
                status="TA forecast",
                notes="T+2 TA redemption vs DVP overlap",
            ),
            _event(
                event_id="fee-mgmt",
                raw=_month_end(as_of),
                cal="HK",
                as_of=as_of,
                kind="FEE",
                direction="OUT",
                amount=Decimal("185000"),
                security_id="FEE-MGMT",
                name="Management & custody accrual",
                counterparty="Custodian",
                status="Accrued monthly",
            ),
        ]
    )
    return events, opening, aum


def _empty_bucket(name: str) -> TimeBucketRow:
    z = Decimal("0.00")
    return TimeBucketRow(bucket=name, inflow=z, outflow=z, net=z, cumulative=z)


def _accumulate_buckets(mode: str, events: list[CashEvent], opening: Decimal) -> list[TimeBucketRow]:
    names = CHART_BUCKETS if mode == "chart" else SFC_BUCKETS
    rows = [_empty_bucket(n[0]) for n in names]
    index = {n[0]: i for i, n in enumerate(names)}
    for ev in events:
        key = ev.bucket_chart if mode == "chart" else ev.bucket_sfc
        row = rows[index[key]]
        if ev.direction == "IN":
            row.inflow += ev.amount
        else:
            row.outflow += ev.amount
        if ev.kind == "MATURITY":
            row.maturity += ev.amount
        elif ev.kind == "COUPON":
            row.coupon += ev.amount
        elif ev.kind == "SUBSCRIPTION":
            row.subscription += ev.amount
        elif ev.kind == "DVP":
            row.dvp += ev.amount
        elif ev.kind == "REDEMPTION":
            row.redemption += ev.amount
        else:
            row.fee += ev.amount
    running = opening
    for row in rows:
        row.net = _money(row.inflow - row.outflow)
        running += row.net
        row.cumulative = _money(running)
        row.inflow = _money(row.inflow)
        row.outflow = _money(row.outflow)
        row.maturity = _money(row.maturity)
        row.coupon = _money(row.coupon)
        row.subscription = _money(row.subscription)
        row.dvp = _money(row.dvp)
        row.redemption = _money(row.redemption)
        row.fee = _money(row.fee)
    return rows


def build_cash_ladder(as_of: date | None = None) -> CashLadderSnapshot:
    as_of = as_of or AS_OF_DEFAULT
    events, opening, aum = demo_cash_events(as_of)
    events.sort(key=lambda e: (e.adjusted_date, e.event_id))
    by_day: dict[date, list[CashEvent]] = {}
    for ev in events:
        by_day.setdefault(ev.adjusted_date, []).append(ev)

    last_ev = max(e.adjusted_date for e in events)
    end = max(last_ev + timedelta(days=2), as_of + timedelta(days=7))
    days: list[DailyPack] = []
    running = opening
    deficit = False
    cursor = as_of
    while cursor <= end:
        pack_events = by_day.get(cursor, [])
        inflow = _money(sum((e.amount for e in pack_events if e.direction == "IN"), Decimal("0")))
        outflow = _money(sum((e.amount for e in pack_events if e.direction == "OUT"), Decimal("0")))
        net = _money(inflow - outflow)
        running = _money(running + net)
        if running < 0:
            deficit = True
        days.append(
            DailyPack(
                date=cursor,
                net=net,
                inflow=inflow,
                outflow=outflow,
                cumulative=running,
                event_count=len(pack_events),
                holiday_hk=is_holiday(cursor, "HK"),
                holiday_us=is_holiday(cursor, "US"),
                weekend=is_weekend(cursor),
                deficit=running < 0,
                events=pack_events,
            )
        )
        cursor += timedelta(days=1)

    sfc_rows = _accumulate_buckets("sfc", events, opening)
    chart_rows = _accumulate_buckets("chart", events, opening)

    remaining = [
        e
        for e in events
        if e.kind == "MATURITY"
    ]
    dla_wla: list[DlaWlaDay] = []
    for i in range(0, 8):
        day = as_of + timedelta(days=i)
        cash = next((p.cumulative for p in days if p.date == day), opening)
        dla_amt = cash
        wla_amt = cash
        for ev in remaining:
            if ev.adjusted_date < day:
                continue
            bdays = business_days_until(day, ev.adjusted_date, "HK")
            if bdays <= 1:
                dla_amt += ev.amount
            if bdays <= 5:
                wla_amt += ev.amount
        dla_pct = _money(dla_amt / aum * 100) if aum else Decimal("0")
        wla_pct = _money(wla_amt / aum * 100) if aum else Decimal("0")
        dla_wla.append(
            DlaWlaDay(
                date=day,
                cash=_money(cash),
                dla_pct=dla_pct,
                wla_pct=wla_pct,
                dla_ok=dla_pct >= DLA_FLOOR,
                wla_ok=wla_pct >= WLA_FLOOR,
            )
        )

    net_7d = _money(sum((e.signed_amount for e in events if 0 <= e.days <= 7), Decimal("0")))
    reinvest_events = [
        e
        for e in events
        if e.kind == "MATURITY" and e.days <= 3 and e.security_id.startswith(("NCD", "TD"))
    ]
    reinvest_amt = _money(sum((e.amount for e in reinvest_events), Decimal("0")))
    ideas: list[ReinvestIdea] = []
    for e in reinvest_events:
        asset = "TD" if e.security_id.startswith("TD") else "NCD"
        tenor = "3M" if asset == "NCD" else "7D"
        href = (
            "/workbench?roll=1"
            f"&assetClass={asset}"
            f"&counterparty={quote(e.counterparty)}"
            f"&notional={int(e.amount)}"
            f"&tenorPreset={tenor}"
        )
        when = "今日" if e.days == 0 else "明日" if e.days == 1 else f"{e.days} 日内"
        ideas.append(
            ReinvestIdea(
                security_id=e.security_id,
                name=e.name,
                counterparty=e.counterparty,
                asset_class=asset,
                amount=e.amount,
                adjusted_date=e.adjusted_date,
                days=e.days,
                suggestion=f"{e.counterparty} {int(e.amount/1_000_000)}m {asset} {when}到期，建议续作 {tenor} 以维持 WAM 达标",
                workbench_href=href,
            )
        )

    dla_break = any(not d.dla_ok or not d.wla_ok for d in dla_wla)
    holidays = []
    for d in sorted(HK_HOLIDAYS | US_HOLIDAYS):
        if as_of <= d <= as_of + timedelta(days=45):
            labels = []
            if d in HK_HOLIDAYS:
                labels.append("HK")
            if d in US_HOLIDAYS:
                labels.append("US Fed")
            holidays.append({"date": d.isoformat(), "label": "/".join(labels)})

    return CashLadderSnapshot(
        as_of=as_of,
        opening_cash=_money(opening),
        available_cash=_money(opening),
        net_7d=net_7d,
        reinvestment_3d=reinvest_amt,
        deficit=deficit,
        kpis={
            "dla_status": "WATCH" if dla_break else "OK",
            "gap_status": "DEFICIT" if deficit else "OK",
        },
        events=events,
        days=days,
        sfc_buckets=sfc_rows,
        chart_buckets=chart_rows,
        dla_wla=dla_wla,
        reinvest=ideas,
        calendar_month=f"{as_of.year}-{as_of.month:02d}",
        holidays=holidays,
    )
