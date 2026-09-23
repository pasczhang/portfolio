"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { Card } from "@/components/ui/card";
import { DangerZoneCard } from "@/components/settings/DangerZoneCard";
import { DataBackupCard } from "@/components/settings/DataBackupCard";
import { UserManagementCard } from "@/components/settings/UserManagementCard";
import { usePermissions } from "@/lib/auth/usePermissions";
import { moneyFull } from "@/lib/format";

export default function SettingsPage() {
  const { fund, asOf } = useDesk();
  const { source, metrics, cashPosition } = useBook();
  const { isAdmin, canFundReset } = usePermissions();

  return (
    <AppShell
      title="系统设置 · Fund Settings"
      subtitle={`${fund.name} · 用户权限 / 数据备份 / 初始化`}
      source={source}
    >
      <Card className="p-4">
        <h2 className="text-sm font-semibold">当前基金</h2>
        <dl className="mt-3 grid gap-2 font-mono text-xs sm:grid-cols-2">
          <div>
            <dt className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">名称</dt>
            <dd>{fund.name}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">代码 / ISIN</dt>
            <dd>
              {fund.code} · {fund.isin}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">份额币种 / 成立日</dt>
            <dd>
              {fund.ccy} · {fund.inception}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">估值日 / NAV</dt>
            <dd>
              {asOf} · {moneyFull(metrics.officialNav || metrics.aum, fund.ccy)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">T+0 可用现金</dt>
            <dd>{moneyFull(cashPosition.t0Available, fund.ccy)}</dd>
          </div>
        </dl>
      </Card>
      {isAdmin ? <UserManagementCard /> : null}
      <DataBackupCard />
      {canFundReset ? <DangerZoneCard /> : null}
    </AppShell>
  );
}
