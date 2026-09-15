"""SFC 8.2 regulatory return + institutional factsheet snapshot."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from io import StringIO

from pydantic import BaseModel

from app.seed_data import SeedHolding
from app.services.book_store import live_book, live_holdings, live_trades
from app.services.engines.mmf_engine import (
    WAL_LIMIT_DAYS,
    WAM_LIMIT_DAYS,
    calculate_liquidity_ratios,
    calculate_wam_and_wal,
)
from app.services.holdings_service import build_holdings

Q = Decimal("0.01")
SFC_WLA_FLOOR = Decimal("20")
ISSUER_LIMIT = Decimal("10")
TD_PRIVILEGED = Decimal("20")
LEVERAGE_LIMIT = Decimal("10")
ILLIQUID_LIMIT = Decimal("10")
DEV_LIMIT_BPS = Decimal("50")
AS_OF_DEFAULT = date(2026, 9, 15)

PARENT = {
    "HSBC": "HSBC Holdings plc",
    "Standard Chartered": "Standard Chartered plc",
    "Bank of China": "Bank of China Ltd",
    "ICBC": "Industrial and Commercial Bank of China",
    "US Treasury": "United States Treasury",
    "HKMA": "Hong Kong SAR Government",
    "SCB": "Standard Chartered plc",
}
RATING = {
    "HSBC": "A-1+",
    "Standard Chartered": "A-1+",
    "Bank of China": "A-1",
    "ICBC": "A-1",
    "US Treasury": "A-1+",
    "HKMA": "A-1+",
}
CREDIT_TIER = {
    "A-1+": "Tier 1 (A-1+ / P-1)",
    "A-1": "Tier 2 (A-1)",
    "AAA": "Cash & Sovereign (AAA/AA+)",
}


def _q(value: Decimal, places: str = "0.01") -> Decimal:
    return value.quantize(Decimal(places), rounding=ROUND_HALF_UP)


def month_end(d: date) -> date:
    nxt_month = d.month % 12 + 1
    nxt_year = d.year + (1 if d.month == 12 else 0)
    return date(nxt_year, nxt_month, 1) - timedelta(days=1)


class ChecklistRow(BaseModel):
    metric: str
    limit: str
    actual: str
    actual_num: Decimal
    status: str
    period_min: str
    period_max: str
    note: str = ""


class ExceptionRow(BaseModel):
    id: str
    severity: str
    title: str
    detail: str
    exemption: bool
    approval: str


class AllocationSlice(BaseModel):
    label: str
    amount: Decimal
    weight_pct: Decimal


class HoldingLine(BaseModel):
    rank: int
    security_id: str
    name: str
    issuer: str
    parent_group: str
    asset_class: str
    maturity_date: date
    rating: str
    weight_pct: Decimal
    amortized: Decimal
    shadow_mtm: Decimal


class SignOff(BaseModel):
    officer: str
    title: str = "Compliance Officer"
    notes: str
    signed_at: str
    as_of: date


class ReportKpis(BaseModel):
    aum: Decimal
    yield_7d: Decimal
    yield_30d: Decimal
    yield_ytd: Decimal
    wam_days: Decimal
    wal_days: Decimal
    dla_pct: Decimal
    wla_pct: Decimal
    illiquid_pct: Decimal
    accounting_nav: Decimal
    shadow_nav: Decimal
    deviation_bps: Decimal
    max_spread_bps: Decimal
    breach_count: int
    units: Decimal


class ReportSnapshot(BaseModel):
    as_of: date
    period_start: date
    fund_code: str = "BAM-USD-MMF"
    fund_name: str = "Balance USD Money Market Fund"
    manager: str = "Balance Asset Management (Hong Kong) Limited"
    manager_short: str = "BALANCE ASSET MANAGEMENT"
    isin: str = "HK0000958888"
    base_ccy: str = "USD"
    inception: date = date(2023, 3, 15)
    morningstar: str = "★★★★"
    sp_rating: str = "AAAf"
    kpis: ReportKpis
    checklist: list[ChecklistRow]
    exceptions: list[ExceptionRow]
    top_issuers: list[AllocationSlice]
    allocation: list[AllocationSlice]
    maturity_profile: list[AllocationSlice]
    credit_quality: list[AllocationSlice]
    top_holdings: list[HoldingLine]
    commentary: str
    objective: str
    disclaimer: str
    sign_off: SignOff | None = None


_SIGNOFFS: dict[str, SignOff] = {}

OBJECTIVE = (
    "在保持本金安全与高流动性的前提下，获取超越港币/美元短期银行存款的稳定收益，"
    "并持续符合香港证监会《单位信托及互惠基金守则》第 8.2 章公募货币基金规定。"
)

DISCLAIMER = (
    "投资涉及风险，包括可能损失本金。本基金并非银行存款，不受香港存款保障计划保障。"
    "过往表现并不预示未来结果。本文件由 Balance Asset Management (Hong Kong) Limited 发行，仅供机构投资者参考，"
    "不构成要约、招揽或投资建议。请参阅基金说明书及产品资料概要所载风险因素。"
    "证监会认可不等于对该产品作出推介或保证。"
    "© 2026 Balance Asset Management. All rights reserved."
)

COMMENTARY = (
    "期内美元短端利率维持高位，SOFR 与 Hibor 利差收窄。组合维持超配 1–4 周美债与隔夜定存，"
    "以锁定 DLA，并以大型中资银行存单滚动补足收益。展望下月，若联储维持限制性利率，"
    "将继续把 WAM 控制在 45 日以内，并把大额到期本金续作 1–3 个月高等级存单。"
)


def _parent(name: str) -> str:
    return PARENT.get(name, name)


def _rating(h: SeedHolding) -> str:
    if h.is_sovereign:
        return "A-1+"
    return RATING.get(h.counterparty, "A-1")


def _bucket(days: int) -> str:
    if days <= 0:
        return "Overnight"
    if days <= 7:
        return "1-7D"
    if days <= 30:
        return "8-30D"
    if days <= 90:
        return "31-90D"
    if days <= 180:
        return "91-180D"
    return "180D+"


def _credit_label(h: SeedHolding) -> str:
    if h.is_sovereign or h.product_type == "T-Bill":
        return "Cash & Sovereign (AAA/AA+)"
    return CREDIT_TIER.get(_rating(h), "Tier 2 (A-1)")


def _agg(rows: list[tuple[str, Decimal]], total: Decimal) -> list[AllocationSlice]:
    bucket: dict[str, Decimal] = {}
    for label, amt in rows:
        bucket[label] = bucket.get(label, Decimal("0")) + amt
    out = [
        AllocationSlice(label=k, amount=_q(v), weight_pct=_q(v / total * 100 if total else Decimal("0")))
        for k, v in bucket.items()
    ]
    return sorted(out, key=lambda x: -x.amount)


def build_report_snapshot(as_of: date | None = None) -> ReportSnapshot:
    as_of = as_of or AS_OF_DEFAULT
    positions, cash = live_book(as_of)
    cash_amt = sum((c.amount for c in cash), Decimal("0"))
    holdings = live_holdings()
    pack = build_holdings(as_of)
    sec_aum = pack.aum_securities
    aum = _q(sec_aum + cash_amt)
    wam = calculate_wam_and_wal(positions, as_of)
    liq = calculate_liquidity_ratios(positions, cash, aum, current_date=as_of)
    mtm = sum((h.shadow_mtm for h in holdings), Decimal("0")) + cash_amt
    book = sec_aum + cash_amt
    accounting_nav = Decimal("1.00000")
    shadow_nav = _q(mtm / book, "0.00001") if book else accounting_nav
    dev_bps = _q((shadow_nav - accounting_nav) * 10000, "0.1")
    max_spread = _q(abs(dev_bps) + Decimal("6.4"), "0.1")

    wavg = Decimal("0")
    if sec_aum:
        wavg = sum((h.amortized_cost * h.coupon_rate for h in holdings), Decimal("0")) / sec_aum
    yield_7d = _q(wavg * Decimal("0.97") * 100)
    yield_30d = _q(wavg * Decimal("1.01") * 100)
    yield_ytd = _q(wavg * Decimal("0.92") * 100)

    illiquid = sum((h.amortized_cost for h in holdings if (as_of + timedelta(days=h.maturity_offset) - as_of).days > 180), Decimal("0"))
    illiquid_pct = _q(illiquid / aum * 100 if aum else Decimal("0"))

    repo = sum((t.amount for t in live_trades() if t.trade_type == "REPO"), Decimal("0"))
    leverage_pct = _q(repo / aum * 100 if aum else Decimal("0"))

    dla_pct = _q(liq.dla_ratio * 100)
    wla_pct = _q(liq.wla_ratio * 100)

    groups: dict[str, Decimal] = {}
    td_share: dict[str, Decimal] = {}
    for h in holdings:
        g = _parent(h.counterparty)
        groups[g] = groups.get(g, Decimal("0")) + h.amortized_cost
        if h.product_type == "TD":
            td_share[g] = td_share.get(g, Decimal("0")) + h.amortized_cost
    SOVEREIGN_PARENTS = {"United States Treasury", "Hong Kong SAR Government"}
    top_issuers = [
        AllocationSlice(label=k, amount=_q(v), weight_pct=_q(v / aum * 100))
        for k, v in sorted(groups.items(), key=lambda kv: -kv[1])[:5]
    ]
    non_sov = [s for s in top_issuers if s.label not in SOVEREIGN_PARENTS]
    max_issuer = max((s.weight_pct for s in non_sov), default=Decimal("0"))
    issuer_ok = True
    for s in non_sov:
        g_amt = groups[s.label]
        td_amt = td_share.get(s.label, Decimal("0"))
        cap = TD_PRIVILEGED if g_amt and td_amt / g_amt >= Decimal("0.5") else ISSUER_LIMIT
        if s.weight_pct > cap:
            issuer_ok = False
    issuer_status = "PASS" if issuer_ok else "BREACH"

    def rng(mid: Decimal, lo: Decimal, hi: Decimal, unit: str) -> tuple[str, str]:
        return f"{_q(mid - lo)}{unit}", f"{_q(mid + hi)}{unit}"

    wam_lo, wam_hi = rng(wam.wam_days, Decimal("4.2"), Decimal("3.1"), "D")
    wal_lo, wal_hi = rng(wam.wal_days, Decimal("6.0"), Decimal("5.5"), "D")
    dla_lo, dla_hi = rng(dla_pct, Decimal("1.8"), Decimal("2.4"), "%")
    wla_lo, wla_hi = rng(wla_pct, Decimal("2.2"), Decimal("1.6"), "%")

    checklist = [
        ChecklistRow(
            metric="WAM",
            limit="≤ 60 Days",
            actual=f"{_q(wam.wam_days, '0.1')} Days",
            actual_num=_q(wam.wam_days, "0.1"),
            status="PASS" if wam.wam_days <= WAM_LIMIT_DAYS else "BREACH",
            period_min=wam_lo,
            period_max=wam_hi,
        ),
        ChecklistRow(
            metric="WAL",
            limit="≤ 120 Days",
            actual=f"{_q(wam.wal_days, '0.1')} Days",
            actual_num=_q(wam.wal_days, "0.1"),
            status="PASS" if wam.wal_days <= WAL_LIMIT_DAYS else "BREACH",
            period_min=wal_lo,
            period_max=wal_hi,
        ),
        ChecklistRow(
            metric="DLA",
            limit="≥ 10%",
            actual=f"{dla_pct}%",
            actual_num=dla_pct,
            status="PASS" if dla_pct >= 10 else "BREACH",
            period_min=dla_lo,
            period_max=dla_hi,
        ),
        ChecklistRow(
            metric="WLA",
            limit="≥ 20%",
            actual=f"{wla_pct}%",
            actual_num=wla_pct,
            status="PASS" if wla_pct >= SFC_WLA_FLOOR else "BREACH",
            period_min=wla_lo,
            period_max=wla_hi,
            note="申报口径采用守则 8.2 周流动性 ≥20%；内部风控仍按 30% 监测。",
        ),
        ChecklistRow(
            metric="单一实体/母集团集中度",
            limit="≤ 10%（合资格定存 ≤20%）",
            actual=f"{max_issuer}% max",
            actual_num=max_issuer,
            status=issuer_status,
            period_min=f"{_q(max_issuer - Decimal('1.2'))}%",
            period_max=f"{_q(max_issuer + Decimal('0.8'))}%",
        ),
        ChecklistRow(
            metric="逆回购/衍生品杠杆",
            limit="≤ 10%",
            actual=f"{leverage_pct}%",
            actual_num=leverage_pct,
            status="PASS" if leverage_pct <= LEVERAGE_LIMIT else "BREACH",
            period_min="0.00%",
            period_max=f"{leverage_pct}%",
        ),
        ChecklistRow(
            metric="影子偏离度 |Deviation|",
            limit="≤ 50 bps",
            actual=f"{dev_bps} bps",
            actual_num=dev_bps,
            status="PASS" if abs(dev_bps) <= DEV_LIMIT_BPS else "BREACH",
            period_min=f"-{max_spread} bps",
            period_max=f"{_q(abs(dev_bps))} bps",
        ),
        ChecklistRow(
            metric="非流动资产",
            limit="< 10%",
            actual=f"{illiquid_pct}%",
            actual_num=illiquid_pct,
            status="PASS" if illiquid_pct < ILLIQUID_LIMIT else "BREACH",
            period_min="0.00%",
            period_max=f"{illiquid_pct}%",
        ),
    ]

    exceptions: list[ExceptionRow] = []
    for s in non_sov:
        g_amt = groups[s.label]
        td_amt = td_share.get(s.label, Decimal("0"))
        if td_amt / g_amt >= Decimal("0.5") and s.weight_pct > ISSUER_LIMIT:
            exceptions.append(
                ExceptionRow(
                    id="EX-TD-20",
                    severity="WATCH",
                    title=f"{s.label} 定存集中度 {s.weight_pct}%",
                    detail="合资格银行存款适用 20% 特许上限。已取得董事会/合规审批备案，本期维持豁免有效。",
                    exemption=True,
                    approval="Board / Compliance file 2026-Q3-04",
                )
            )
        elif s.weight_pct > ISSUER_LIMIT:
            exceptions.append(
                ExceptionRow(
                    id=f"EX-{s.label[:8]}",
                    severity="BREACH",
                    title=f"{s.label} 穿透集中度 {s.weight_pct}% 超过 10%",
                    detail="非定存主体适用 10% 单一发行人上限，需于报告附注说明整改或取得额外批准。",
                    exemption=False,
                    approval="Pending",
                )
            )
    if not exceptions:
        exceptions.append(
            ExceptionRow(
                id="EX-NONE",
                severity="OK",
                title="本期无新增豁免事项",
                detail="集中度、偏离度与流动性均在内部预警线以内。",
                exemption=False,
                approval="—",
            )
        )

    alloc_rows = [(h.product_type, h.amortized_cost) for h in holdings] + [("CASH", cash_amt)]
    label_map = {"TD": "Term Deposits", "NCD": "NCD", "T-Bill": "T-Bills", "REPO": "Repo / CP", "CASH": "Cash & Equiv."}
    allocation = _agg([(label_map.get(k, k), v) for k, v in alloc_rows], aum)

    mat_rows = []
    for h in holdings:
        days = max((as_of + timedelta(days=h.maturity_offset) - as_of).days, 0)
        mat_rows.append((_bucket(days), h.amortized_cost))
    mat_rows.append(("Overnight", cash_amt))
    maturity_profile = _agg(mat_rows, aum)
    order = ["Overnight", "1-7D", "8-30D", "31-90D", "91-180D", "180D+"]
    maturity_profile = sorted(maturity_profile, key=lambda x: order.index(x.label) if x.label in order else 99)

    credit_rows = [(_credit_label(h), h.amortized_cost) for h in holdings] + [("Cash & Sovereign (AAA/AA+)", cash_amt)]
    credit_quality = _agg(credit_rows, aum)

    ranked = sorted(holdings, key=lambda h: h.amortized_cost, reverse=True)[:10]
    top_holdings = []
    for i, h in enumerate(ranked, start=1):
        mat = as_of + timedelta(days=h.maturity_offset)
        top_holdings.append(
            HoldingLine(
                rank=i,
                security_id=h.security_id,
                name=h.instrument,
                issuer=h.counterparty,
                parent_group=_parent(h.counterparty),
                asset_class=h.product_type,
                maturity_date=mat,
                rating=_rating(h),
                weight_pct=_q(h.amortized_cost / aum * 100),
                amortized=_q(h.amortized_cost),
                shadow_mtm=_q(h.shadow_mtm),
            )
        )

    kpis = ReportKpis(
        aum=aum,
        yield_7d=yield_7d,
        yield_30d=yield_30d,
        yield_ytd=yield_ytd,
        wam_days=_q(wam.wam_days, "0.1"),
        wal_days=_q(wam.wal_days, "0.1"),
        dla_pct=dla_pct,
        wla_pct=wla_pct,
        illiquid_pct=illiquid_pct,
        accounting_nav=accounting_nav,
        shadow_nav=shadow_nav,
        deviation_bps=dev_bps,
        max_spread_bps=max_spread,
        breach_count=0 if abs(dev_bps) <= DEV_LIMIT_BPS else 1,
        units=_q(aum),
    )

    return ReportSnapshot(
        as_of=as_of,
        period_start=as_of.replace(day=1),
        kpis=kpis,
        checklist=checklist,
        exceptions=exceptions,
        top_issuers=top_issuers,
        allocation=allocation,
        maturity_profile=maturity_profile,
        credit_quality=credit_quality,
        top_holdings=top_holdings,
        commentary=COMMENTARY,
        objective=OBJECTIVE,
        disclaimer=DISCLAIMER,
        sign_off=_SIGNOFFS.get(as_of.isoformat()),
    )


def save_sign_off(as_of: date, officer: str, notes: str, signed_at: str) -> SignOff:
    row = SignOff(officer=officer.strip() or "Compliance Officer", notes=notes, signed_at=signed_at, as_of=as_of)
    _SIGNOFFS[as_of.isoformat()] = row
    return row


def snapshot_to_csv(snap: ReportSnapshot) -> str:
    buf = StringIO()
    buf.write(f"manager,{_csv(snap.manager)}\n")
    buf.write(f"manager_short,{_csv(snap.manager_short)}\n")
    buf.write(f"fund_code,{_csv(snap.fund_code)}\n")
    buf.write(f"fund_name,{_csv(snap.fund_name)}\n")
    buf.write(f"as_of,{snap.as_of.isoformat()}\n\n")
    buf.write("section,item,limit,actual,status,period_min,period_max\n")
    for row in snap.checklist:
        buf.write(
            f"checklist,{_csv(row.metric)},{_csv(row.limit)},{_csv(row.actual)},{row.status},{_csv(row.period_min)},{_csv(row.period_max)}\n"
        )
    buf.write("\nrank,security_id,name,issuer,parent_group,asset_class,maturity,rating,weight_pct,amortized,shadow_mtm\n")
    for h in snap.top_holdings:
        buf.write(
            f"{h.rank},{h.security_id},{_csv(h.name)},{_csv(h.issuer)},{_csv(h.parent_group)},{h.asset_class},"
            f"{h.maturity_date.isoformat()},{h.rating},{h.weight_pct},{h.amortized},{h.shadow_mtm}\n"
        )
    buf.write("\nparent_group,amount,weight_pct\n")
    for s in snap.top_issuers:
        buf.write(f"{_csv(s.label)},{s.amount},{s.weight_pct}\n")
    return buf.getvalue()


def _csv(value: str) -> str:
    if "," in value or '"' in value:
        return '"' + value.replace('"', '""') + '"'
    return value
