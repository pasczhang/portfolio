"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermission, type PermissionAction } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/auth/types";

export function usePermissions() {
  const { user } = useAuth();
  const role: UserRole = user?.role ?? "viewer";
  const can = (action: PermissionAction) => hasPermission(role, action);
  return {
    role,
    can,
    canWrite: can("write_trade"),
    canManageUsers: can("manage_users"),
    canFundReset: can("fund_reset"),
    isViewer: role === "viewer",
    isAdmin: role === "admin",
    isTrader: role === "trader",
  };
}
