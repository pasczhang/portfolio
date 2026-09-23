import type { UserRole } from "@/lib/auth/types";

export type PermissionAction = "write_trade" | "manage_users" | "fund_reset";

export const hasPermission = (
  currentUserRole: UserRole,
  action: PermissionAction,
): boolean => {
  if (currentUserRole === "admin") return true;
  if (currentUserRole === "trader") return action === "write_trade";
  if (currentUserRole === "viewer") return false;
  return false;
};
