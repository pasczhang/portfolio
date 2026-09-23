"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  INACTIVITY_MS,
  type AuthContextType,
  type UserProfile,
} from "@/lib/auth/types";
import { findUser, hashPassword, randomToken, saveUser, seedDefaultUsers, toProfile } from "@/lib/auth/users";
import { clearSession, readSession, writeSession } from "@/lib/auth/session";

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedDefaultUsers();
        const session = readSession();
        if (!session) return;
        const stored = await findUser(session.username);
        if (!stored || cancelled) return;
        setUser(toProfile(stored));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string, rememberMe = false) => {
    const stored = await findUser(username);
    if (!stored) return { success: false, message: "用户名或密码错误" };
    if (stored.isActive === false) return { success: false, message: "账户已停用，请联系管理员" };
    const hashed = await hashPassword(password, stored.salt);
    if (hashed !== stored.passwordHash) return { success: false, message: "用户名或密码错误" };
    const next: UserProfile = {
      ...toProfile(stored),
      lastLoginAt: new Date().toISOString(),
    };
    await saveUser({ ...stored, lastLoginAt: next.lastLoginAt });
    writeSession({
      token: randomToken(),
      username: stored.username,
      exp: Date.now() + (rememberMe ? 7 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000),
      rememberMe,
    });
    setUser(next);
    return { success: true };
  }, []);

  const logout = useCallback((opts?: { reason?: "manual" | "idle" | "expired" }) => {
    clearSession();
    setUser(null);
    if (opts?.reason === "idle" || opts?.reason === "expired") {
      window.sessionStorage.setItem("pms-flash", "登录已过期，请重新登录");
      window.sessionStorage.setItem("pms-flash-tone", "error");
    }
  }, []);

  const updatePassword = useCallback(
    async (oldPass: string, newPass: string) => {
      if (!user) return { success: false, message: "未登录" };
      if (newPass.trim().length < 8) return { success: false, message: "新密码至少 8 位" };
      if (newPass === oldPass) return { success: false, message: "新密码不能与旧密码相同" };
      const stored = await findUser(user.username);
      if (!stored) return { success: false, message: "用户不存在" };
      const oldHash = await hashPassword(oldPass, stored.salt);
      if (oldHash !== stored.passwordHash) return { success: false, message: "旧密码不正确" };
      const passwordHash = await hashPassword(newPass, stored.salt);
      const next = { ...stored, passwordHash, mustChangePassword: false };
      await saveUser(next);
      setUser(toProfile(next));
      return { success: true };
    },
    [user],
  );

  useEffect(() => {
    if (!user) return;
    let timer: number;
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => logout({ reason: "idle" }), INACTIVITY_MS);
    };
    bump();
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, bump));
    };
  }, [user, logout]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      logout,
      updatePassword,
    }),
    [user, isLoading, login, logout, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login" || pathname === "/login/";

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && !isLogin) {
      const redirect = pathname && pathname !== "/" ? `?redirect=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${redirect}`);
    }
    if (isAuthenticated && isLogin) {
      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      const target = params.get("redirect") || "/";
      router.replace(target);
    }
  }, [isAuthenticated, isLoading, isLogin, pathname, router]);

  if (isLoading || (!isAuthenticated && !isLogin) || (isAuthenticated && isLogin)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-400" />
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-amber-500">Balance PMS</p>
      </div>
    );
  }

  return <>{children}</>;
}
