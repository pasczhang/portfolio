"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CenteredModal } from "@/components/ui/CenteredModal";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useFormDirty } from "@/lib/persist/dirty";

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { updatePassword } = useAuth();
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useFormDirty();

  async function submit() {
    setError("");
    if (!oldPass) {
      setError("请输入旧密码");
      return;
    }
    if (newPass !== confirm) {
      setError("两次输入的新密码不一致");
      return;
    }
    setBusy(true);
    try {
      const result = await updatePassword(oldPass, newPass);
      if (!result.success) {
        setError(result.message || "修改失败");
        return;
      }
      window.sessionStorage.setItem("pms-flash", "密码已更新");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenteredModal title="修改密码 · Change Password" onClose={onClose}>
      <form
        className="grid gap-3"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="space-y-1">
          <Label htmlFor="pms-old-password">旧密码</Label>
          <Input
            id="pms-old-password"
            name="oldPassword"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={oldPass}
            onChange={(e) => setOldPass(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <Label htmlFor="pms-new-password">新密码</Label>
          <Input
            id="pms-new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <Label htmlFor="pms-confirm-password">确认新密码</Label>
          <Input
            id="pms-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error ? <p className="text-[12px] text-red-400">{error}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="accent" disabled={busy}>
            保存
          </Button>
        </div>
      </form>
    </CenteredModal>
  );
}
