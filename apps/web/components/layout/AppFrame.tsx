"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DeskProvider } from "@/components/layout/DeskProvider";
import { BookProvider } from "@/components/layout/BookProvider";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PersistGuard } from "@/components/persist/PersistGuard";
import { Toast } from "@/components/dashboard/Toast";
import { AuthGate, AuthProvider, useAuth } from "@/lib/auth/AuthProvider";

function FlashToast() {
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "error">("ok");
  useEffect(() => {
    const raw = window.sessionStorage.getItem("pms-flash");
    if (!raw) return;
    const nextTone = window.sessionStorage.getItem("pms-flash-tone") === "error" ? "error" : "ok";
    window.sessionStorage.removeItem("pms-flash");
    window.sessionStorage.removeItem("pms-flash-tone");
    setTone(nextTone);
    setMessage(raw);
    const t = window.setTimeout(() => setMessage(null), 3200);
    return () => window.clearTimeout(t);
  }, [pathname]);
  return <Toast message={message} tone={tone} />;
}

function AuthenticatedShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <BookProvider>
      <div className="min-h-screen bg-background text-foreground">
        {user?.mustChangePassword ? (
          <div className="bg-amber-500/15 px-4 py-1.5 text-center text-[11px] text-amber-300">
            首次使用初始密码登录，建议立即在右上角用户菜单中修改密码。
          </div>
        ) : null}
        <GlobalHeader />
        {children}
        <FlashToast />
        <PersistGuard />
      </div>
    </BookProvider>
  );
}

function ShellSwitch({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login" || pathname === "/login/";
  if (isLogin) {
    return (
      <>
        {children}
        <FlashToast />
      </>
    );
  }
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <DeskProvider>
      <AuthProvider>
        <AuthGate>
          <ShellSwitch>{children}</ShellSwitch>
        </AuthGate>
      </AuthProvider>
    </DeskProvider>
  );
}
