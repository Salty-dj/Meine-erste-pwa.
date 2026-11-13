import type { RoleCode } from "@prisma/client";
export const roleLabels: Record<RoleCode, string> = {
  SUPERADMIN: "Superadministrator",
  CLUB_ADMIN: "Vereinsadministrator",
  TEAM_MANAGER: "Mannschaftsverantwortlicher",
  WAREHOUSE_MANAGER: "Lagerverantwortlicher",
  CASH_MANAGER: "Kassenverantwortlicher",
  MEMBER: "Mitglied / Helfer",
};
export const roleCodes = Object.keys(roleLabels) as RoleCode[];
export type Permission = "accounts" | "club" | "stock" | "finance" | "team";
export function can(roles: readonly RoleCode[], permission: Permission) {
  if (roles.includes("SUPERADMIN")) return true;
  if (permission === "accounts") return false;
  if (roles.includes("CLUB_ADMIN")) return true;
  return permission === "stock"
    ? roles.includes("WAREHOUSE_MANAGER")
    : permission === "finance"
      ? roles.includes("CASH_MANAGER")
      : permission === "team"
        ? roles.includes("TEAM_MANAGER")
        : false;
}
