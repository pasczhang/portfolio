"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { Toast } from "@/components/dashboard/Toast";
import { LocalDataNotice } from "@/components/persist/LocalDataNotice";

export default function LoginPage() {
  const { login } = useAuth();
  const { dark, toggleTheme } = useDesk();
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const redirect = useMemo(() => {
    if (typeof window === "undefined") return "/";
    return new URLSearchParams(window.location.search).get("redirect") || "/";
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await login(username, password, rememberMe);
      if (!result.success) {
        setError(result.message || "用户名或密码错误");
        setToast(result.message || "用户名或密码错误");
        window.setTimeout(() => setToast(null), 2800);
        return;
      }
      router.replace(redirect);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[hsl(var(--background))] px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(38_92%_50%_/_0.12),_transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,_transparent,_hsl(var(--background)))]" />
      <button
        type="button"
        className="absolute right-4 top-4 rounded-md border border-[hsl(var(--border))] p-2"
        onClick={toggleTheme}
        aria-label="Toggle theme"
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="relative w-full max-w-[400px] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/90 p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/brand/balance-mark.png"
            alt="Balance Asset Management"
            width={48}
            height={48}
            className="h-12 w-12 rounded-lg object-cover ring-1 ring-amber-500/30"
            priority
          />
          <p className="mt-3 text-[10px] uppercase tracking-[0.28em] text-amber-500">Balance Asset Management</p>
          <h1 className="mt-1 text-lg font-semibold">Fixed Income PMS</h1>
        </div>

        <form className="grid gap-3" onSubmit={(e) => void onSubmit(e)}>
          <label className="space-y-1">
            <Label>用户名</Label>
            <Input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-10 text-sm"
              required
            />
          </label>
          <label className="space-y-1">
            <Label>密码</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 pr-9 text-sm"
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "隐藏密码" : "显示密码"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
          {error ? <p className="text-[12px] font-medium text-red-400">{error}</p> : null}
          <label className="flex items-center gap-2 text-[12px] text-[hsl(var(--muted-foreground))]">
            <input
              type="checkbox"
              className="accent-amber-500"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            记住我 Remember Me
          </label>
          <Button type="submit" variant="accent" className="h-10 w-full text-sm" disabled={busy}>
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                登录中…
              </span>
            ) : (
              "登录"
            )}
          </Button>
        </form>
        <LocalDataNotice className="mt-3" />
      </div>
      <Toast message={toast} tone="error" />
    </div>
  );
}
