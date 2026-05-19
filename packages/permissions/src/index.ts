import type { EntityStatus } from "@neportal/shared";

export enum Role {
  Owner = "OWNER",
  Admin = "ADMIN",
  Member = "MEMBER",
  Guest = "GUEST",
}

export type Permission =
  | "org.read"
  | "org.write"
  | "users.read"
  | "users.invite"
  | "billing.read";

export const defaultRolePermissions: Record<Role, readonly Permission[]> = {
  [Role.Owner]: ["org.read", "org.write", "users.read", "users.invite", "billing.read"],
  [Role.Admin]: ["org.read", "org.write", "users.read", "users.invite"],
  [Role.Member]: ["org.read", "users.read"],
  [Role.Guest]: ["org.read"],
} as const;

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return defaultRolePermissions[role].includes(permission);
}

export type ProtectedResource = {
  id: string;
  status: EntityStatus;
};
