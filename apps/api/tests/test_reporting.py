from datetime import date

from app.services.engines.reporting import build_report_snapshot, snapshot_to_csv


def test_snapshot_checklist() -> None:
    snap = build_report_snapshot(date(2026, 9, 15))
    metrics = [r.metric for r in snap.checklist]
    assert "WAM" in metrics and "WLA" in metrics and "影子偏离度 |Deviation|" in metrics
    assert snap.kpis.accounting_nav == __import__("decimal").Decimal("1.00000")
    assert snap.kpis.breach_count == 0
    assert len(snap.top_holdings) >= 5
    assert snap.allocation
    assert snap.fund_code == "BAM-USD-MMF"
    assert snap.fund_name == "Balance USD Money Market Fund"
    assert "Balance Asset Management (Hong Kong) Limited" in snap.disclaimer


def test_csv_contains_wam() -> None:
    text = snapshot_to_csv(build_report_snapshot(date(2026, 9, 15)))
    assert "WAM" in text
    assert "parent_group" in text
    assert "BAM-USD-MMF" in text
    assert "Balance Asset Management (Hong Kong) Limited" in text


def test_custom_as_of() -> None:
    snap = build_report_snapshot(date(2026, 8, 31))
    assert snap.as_of.isoformat() == "2026-08-31"
    assert snap.period_start.isoformat() == "2026-08-01"
