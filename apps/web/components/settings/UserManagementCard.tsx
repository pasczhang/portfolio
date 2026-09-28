"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Plus, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CenteredModal } from "@/components/ui/CenteredModal";
import { Toast } from "@/components/dashboard/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { usePermissions } from "@/lib/auth/usePermissions";
import {
  ROLE_LABEL,
  createManagedUser,
  deleteManagedUser,
  listUsers,
  resetManagedPassword,
  setManagedActive,
  toProfile,
  updateManagedRole,
} from "@/lib/auth/users";
import type { UserProfile, UserRole } from "@/lib/auth/types";
import { useFormDirty } from "@/lib/persist/dirty";
import { LocalDataNotice } from "@/components/persist/LocalDataNotice";

const ROLES: UserRole[] = ["admin", "trader", "viewer"];

function roleTone(role: UserRole): "watch" | "ok" | "neutral" {
  if (role === "admin") return "watch";
  if (role === "trader") return "ok";
  return "neutral";
}

function formatTs(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-HK", { hour12: false });
}

export function UserManagementCard() {
  const { user: actor } = useAuth();
  const { canManageUsers } = usePermissions();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [roleTarget, setRoleTarget] = useState<UserProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);

  const reload = useCallback(async () => {
    const rows = await listUsers();
    setUsers(rows.map(toProfile));
  }, []);

  useEffect(() => {
    if (canManageUsers) void reload();
  }, [canManageUsers, reload]);

  function flash(message: string, tone: "ok" | "error" = "ok") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2800);
  }

  if (!canManageUsers) {
    return (
      <Card className="p-4">
        <h2 className="text-sm font-semibold">用户与权限管理 · User & Role Management</h2>
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-amber-200">
          <ShieldAlert className="h-4 w-4" />
          仅管理员可查看和操作用户权限。当前角色无权访问。
        </p>
      </Card>
    );
  }

  async function onToggleActive(row: UserProfile) {
    if (!actor) return;
    const result = await setManagedActive(row.id, !row.isActive, actor.id);
    if (!result.success) {
      flash(result.message || "操作失败", "error");
      return;
    }
    flash(row.isActive ? "用户已停用" : "用户已启用");
    await reload();
  }

  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">用户与权限管理 · User & Role Management</h2>
            <p className="mt-1 text-[12px] text-[hsl(var(--muted-foreground))]">
              创建桌面用户、分配角色、重置密码。凭证以 SHA-256 加盐写入 IndexedDB users 存储区。
            </p>
          </div>
          <Button type="button" variant="accent" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            新建用户
          </Button>
        </div>
        <div className="mt-3 overflow-auto rounded-md border border-[hsl(var(--border))]">
          <table className="w-full min-w-[720px] text-left text-[12px]">
            <thead className="bg-[hsl(var(--muted))]/50 font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
              <tr>
                <th className="px-3 py-2">用户名</th>
                <th className="px-3 py-2">姓名 / 显示名</th>
                <th className="px-3 py-2">角色</th>
                <th className="px-3 py-2">创建时间</th>
                <th className="px-3 py-2">最后登录</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => {
                const self = row.id === actor?.id;
                return (
                  <tr key={row.id} className="border-t border-[hsl(var(--border))]">
                    <td className="px-3 py-2 font-mono">{row.username}</td>
                    <td className="px-3 py-2">{row.displayName}</td>
                    <td className="px-3 py-2">
                      <Badge tone={roleTone(row.role)}>{ROLE_LABEL[row.role]}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">{formatTs(row.createdAt)}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{formatTs(row.lastLoginAt)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={row.isActive ? "ok" : "breach"}>{row.isActive ? "启用" : "停用"}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button type="button" variant="ghost" onClick={() => setResetTarget(row)}>
                          重置密码
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setRoleTarget(row)}>
                          修改角色
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={self}
                          title={self ? "不能停用当前登录的管理员自己" : undefined}
                          onClick={() => void onToggleActive(row)}
                        >
                          {row.isActive ? "停用" : "启用"}
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          disabled={self}
                          title={self ? "不能删除当前登录的管理员自己" : undefined}
                          onClick={() => setDeleteTarget(row)}
                        >
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {addOpen ? (
        <AddUserModal
          onClose={() => setAddOpen(false)}
          onSaved={async () => {
            setAddOpen(false);
            flash("用户已创建");
            await reload();
          }}
        />
      ) : null}
      {resetTarget ? (
        <ResetPasswordModal
          target={resetTarget}
          onClose={() => setResetTarget(null)}
          onSaved={async () => {
            setResetTarget(null);
            flash("密码已重置，用户下次登录需使用新密码");
            await reload();
          }}
        />
      ) : null}
      {roleTarget ? (
        <EditRoleModal
          target={roleTarget}
          actorId={actor?.id || ""}
          onClose={() => setRoleTarget(null)}
          onSaved={async () => {
            setRoleTarget(null);
            flash("角色已更新");
            await reload();
          }}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteUserModal
          target={deleteTarget}
          actorId={actor?.id || ""}
          onClose={() => setDeleteTarget(null)}
          onSaved={async () => {
            setDeleteTarget(null);
            flash("用户已删除");
            await reload();
          }}
        />
      ) : null}
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-1">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

function AddUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<UserRole>("trader");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useFormDirty();

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const result = await createManagedUser({
        username,
        displayName,
        password,
        confirmPassword: confirm,
        role,
      });
      if (!result.success) {
        setError(result.message || "创建失败");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenteredModal title="新建用户 · Add User" onClose={onClose}>
      <form
        className="grid gap-3"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="用户名 Username">
          <Input
            autoFocus
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="英文 / 数字"
          />
        </Field>
        <Field label="显示名称 Display Name">
          <Input
            autoComplete="off"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="如：张三 - 固收组"
          />
        </Field>
        <Field label="初始登录密码">
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="确认密码">
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Field label="分配角色">
          <select
            className="h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        {error ? <p className="text-[12px] text-red-400">{error}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="accent" disabled={busy}>
            创建
          </Button>
        </div>
      </form>
    </CenteredModal>
  );
}

function ResetPasswordModal({
  target,
  onClose,
  onSaved,
}: {
  target: UserProfile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useFormDirty();

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const result = await resetManagedPassword(target.id, password, confirm);
      if (!result.success) {
        setError(result.message || "重置失败");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenteredModal title={`重置密码 · ${target.username}`} onClose={onClose}>
      <form
        className="grid gap-3"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-[12px] text-[hsl(var(--muted-foreground))]">
          将强制覆盖 {target.displayName} 的登录密码（SHA-256 加盐）。
        </p>
        <LocalDataNotice />
        <Field label="新密码">
          <Input type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="确认新密码">
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error ? <p className="text-[12px] text-red-400">{error}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="accent" disabled={busy}>
            确认重置
          </Button>
        </div>
      </form>
    </CenteredModal>
  );
}

function EditRoleModal({
  target,
  actorId,
  onClose,
  onSaved,
}: {
  target: UserProfile;
  actorId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<UserRole>(target.role);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const result = await updateManagedRole(target.id, role, actorId);
      if (!result.success) {
        setError(result.message || "更新失败");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenteredModal title={`修改角色 · ${target.username}`} onClose={onClose} widthClass="max-w-sm">
      <div className="grid gap-3">
        <Field label="权限级别">
          <select
            className="h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        {error ? <p className="text-[12px] text-red-400">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="button" variant="accent" disabled={busy} onClick={() => void submit()}>
            保存
          </Button>
        </div>
      </div>
    </CenteredModal>
  );
}

function DeleteUserModal({
  target,
  actorId,
  onClose,
  onSaved,
}: {
  target: UserProfile;
  actorId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const result = await deleteManagedUser(target.id, actorId);
      if (!result.success) {
        setError(result.message || "删除失败");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenteredModal title="删除用户 · 二次确认" onClose={onClose} widthClass="max-w-sm">
      <p className="text-[12px] text-amber-200">
        确认删除用户 <span className="font-mono text-amber-100">{target.username}</span>（{target.displayName}
        ）？此操作不可撤销。
      </p>
      {error ? <p className="mt-2 text-[12px] text-red-400">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button type="button" variant="danger" disabled={busy} onClick={() => void submit()}>
          确认删除
        </Button>
      </div>
    </CenteredModal>
  );
}
