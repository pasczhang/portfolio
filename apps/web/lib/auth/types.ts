export type UserRole = "admin" | "trader" | "viewer";
export type AuthRole = UserRole;

export type UserProfile = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
  mustChangePassword?: boolean;
};

export type SystemUser = {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
};

export type AuthSession = {
  token: string;
  username: string;
  exp: number;
  rememberMe: boolean;
};

export type AuthResult = { success: boolean; message?: string };

export type AuthContextType = {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<AuthResult>;
  logout: (opts?: { reason?: "manual" | "idle" | "expired" }) => void;
  updatePassword: (oldPass: string, newPass: string) => Promise<AuthResult>;
};

export const AUTH_SESSION_KEY = "pms-auth-session";
export const AUTH_USERS_KEY = "users";
export const AUTH_USERS_LEGACY_KEY = "pms-auth-users";
export const INACTIVITY_MS = 30 * 60 * 1000;
export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "admin123";
