import { sha256Hex } from "@/lib/persist/checksum";
import { kvGet, kvSet } from "@/lib/persist/idb";
import {
  AUTH_USERS_KEY,
  AUTH_USERS_LEGACY_KEY,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  type AuthResult,
  type UserProfile,
  type UserRole,
} from "@/lib/auth/types";

export type StoredUser = UserProfile & {
  passwordHash: string;
  salt: string;
};

const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/;
const LS_USERS_KEY = "pms-auth-users-cache";

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "管理员 (Admin)",
  trader: "交易员 (Trader)",
  viewer: "只读风控 (Viewer)",
};

function randomHex(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${password}`);
}

function normalizeUser(raw: StoredUser): StoredUser {
  return {
    ...raw,
    isActive: raw.isActive !== false,
    createdAt: raw.createdAt || new Date().toISOString(),
    displayName: raw.displayName || raw.username,
    role: raw.role || "viewer",
  };
}

function readLocalUsers(): StoredUser[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_USERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredUser[];
    return Array.isArray(parsed) && parsed.length ? parsed.map(normalizeUser) : null;
  } catch {
    return null;
  }
}

function writeLocalUsers(users: StoredUser[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_USERS_KEY, JSON.stringify(users.map(normalizeUser)));
}

async function persistUsers(users: StoredUser[]): Promise<void> {
  const list = users.map(normalizeUser);
  writeLocalUsers(list);
  try {
    await kvSet(AUTH_USERS_KEY, list);
  } catch {
    /* IndexedDB may be blocked by another tab */
  }
}

export async function seedDefaultUsers(): Promise<StoredUser[]> {
  try {
    const fromStore = await kvGet<StoredUser[]>(AUTH_USERS_KEY);
    if (fromStore && fromStore.length) {
      const list = fromStore.map(normalizeUser);
      writeLocalUsers(list);
      return list;
    }
    const fromLegacy = await kvGet<StoredUser[]>(AUTH_USERS_LEGACY_KEY);
    if (fromLegacy && fromLegacy.length) {
      const migrated = fromLegacy.map(normalizeUser);
      await persistUsers(migrated);
      return migrated;
    }
  } catch {
    const cached = readLocalUsers();
    if (cached) return cached;
  }
  const cached = readLocalUsers();
  if (cached) return cached;
  const salt = randomHex(16);
  const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD, salt);
  const users: StoredUser[] = [
    {
      id: "usr-admin",
      username: DEFAULT_ADMIN_USERNAME,
      displayName: "System Administrator",
      role: "admin",
      isActive: true,
      createdAt: new Date().toISOString(),
      mustChangePassword: true,
      passwordHash,
      salt,
    },
  ];
  await persistUsers(users);
  return users;
}

export async function listUsers(): Promise<StoredUser[]> {
  return seedDefaultUsers();
}

export async function findUser(username: string): Promise<StoredUser | undefined> {
  const users = await listUsers();
  const key = username.trim().toLowerCase();
  return users.find((u) => u.username.toLowerCase() === key);
}

export async function saveUser(next: StoredUser): Promise<void> {
  const users = await listUsers();
  const idx = users.findIndex((u) => u.id === next.id);
  const list = idx >= 0 ? users.map((u, i) => (i === idx ? normalizeUser(next) : u)) : [...users, normalizeUser(next)];
  await persistUsers(list);
}

export function toProfile(user: StoredUser): UserProfile {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive !== false,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    mustChangePassword: user.mustChangePassword,
  };
}

export function randomToken(): string {
  return `pms_${randomHex(24)}`;
}

function countActiveAdmins(users: StoredUser[], exceptId?: string): number {
  return users.filter((u) => u.id !== exceptId && u.role === "admin" && u.isActive !== false).length;
}

export async function createManagedUser(input: {
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
}): Promise<AuthResult & { user?: UserProfile }> {
  const username = input.username.trim();
  const displayName = input.displayName.trim();
  if (!USERNAME_RE.test(username)) {
    return { success: false, message: "用户名须为 2–32 位英文、数字（可含 . _ -）" };
  }
  if (!displayName) return { success: false, message: "请填写显示名称" };
  if (input.password.trim().length < 8) return { success: false, message: "初始密码至少 8 位" };
  if (input.password !== input.confirmPassword) return { success: false, message: "两次输入的密码不一致" };
  const users = await listUsers();
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return { success: false, message: "用户名已存在" };
  }
  const salt = randomHex(16);
  const passwordHash = await hashPassword(input.password, salt);
  const next: StoredUser = {
    id: `usr_${randomHex(8)}`,
    username,
    displayName,
    role: input.role,
    isActive: true,
    createdAt: new Date().toISOString(),
    mustChangePassword: true,
    passwordHash,
    salt,
  };
  await persistUsers([...users, next]);
  return { success: true, user: toProfile(next) };
}

export async function resetManagedPassword(userId: string, password: string, confirmPassword: string): Promise<AuthResult> {
  if (password.trim().length < 8) return { success: false, message: "新密码至少 8 位" };
  if (password !== confirmPassword) return { success: false, message: "两次输入的密码不一致" };
  const users = await listUsers();
  const stored = users.find((u) => u.id === userId);
  if (!stored) return { success: false, message: "用户不存在" };
  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  await persistUsers(
    users.map((u) => (u.id === userId ? { ...u, salt, passwordHash, mustChangePassword: true } : u)),
  );
  return { success: true };
}

export async function updateManagedRole(userId: string, role: UserRole, actorId: string): Promise<AuthResult> {
  const users = await listUsers();
  const stored = users.find((u) => u.id === userId);
  if (!stored) return { success: false, message: "用户不存在" };
  if (stored.role === "admin" && role !== "admin" && stored.isActive && countActiveAdmins(users, userId) < 1) {
    return { success: false, message: "系统必须保留至少一名启用中的管理员" };
  }
  if (userId === actorId && stored.role === "admin" && role !== "admin") {
    return { success: false, message: "不能取消当前登录管理员的管理员角色" };
  }
  await persistUsers(users.map((u) => (u.id === userId ? { ...u, role } : u)));
  return { success: true };
}

export async function setManagedActive(userId: string, isActive: boolean, actorId: string): Promise<AuthResult> {
  if (userId === actorId) return { success: false, message: "不能停用当前登录的管理员自己" };
  const users = await listUsers();
  const stored = users.find((u) => u.id === userId);
  if (!stored) return { success: false, message: "用户不存在" };
  if (!isActive && stored.role === "admin" && stored.isActive && countActiveAdmins(users, userId) < 1) {
    return { success: false, message: "系统必须保留至少一名启用中的管理员" };
  }
  await persistUsers(users.map((u) => (u.id === userId ? { ...u, isActive } : u)));
  return { success: true };
}

export async function deleteManagedUser(userId: string, actorId: string): Promise<AuthResult> {
  if (userId === actorId) return { success: false, message: "不能删除当前登录的管理员自己" };
  const users = await listUsers();
  const stored = users.find((u) => u.id === userId);
  if (!stored) return { success: false, message: "用户不存在" };
  if (stored.role === "admin" && stored.isActive && countActiveAdmins(users, userId) < 1) {
    return { success: false, message: "系统必须保留至少一名启用中的管理员" };
  }
  await persistUsers(users.filter((u) => u.id !== userId));
  return { success: true };
}
