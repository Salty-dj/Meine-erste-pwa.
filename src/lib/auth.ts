import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionUser } from "./auth-service";
import { can, type Permission } from "./roles";
export const COOKIE_NAME = "tsv_session";
export const currentUser = cache(async () =>
  sessionUser((await cookies()).get(COOKIE_NAME)?.value),
);
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/anmelden");
  return user;
}
export async function requireReadyUser() {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/konto?erststart=1");
  return user;
}
export async function requirePermission(permission: Permission) {
  const user = await requireReadyUser();
  if (!can(user.roles, permission)) throw new Error("Zugriff nicht erlaubt.");
  return user;
}
export function cookieOptions(expires: Date) {
  const secure = process.env.SESSION_SECURE !== "false";
  if (
    process.env.NODE_ENV === "production" &&
    !secure &&
    process.env.APP_URL &&
    !new URL(process.env.APP_URL).hostname.match(/^(localhost|127\.0\.0\.1)$/)
  )
    throw new Error("Produktiver Betrieb benötigt sichere HTTPS-Cookies.");
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
export async function assertOrigin() {
  const origin = (await headers()).get("origin");
  const allowed = process.env.APP_URL;
  if (!allowed || !origin || new URL(origin).origin !== new URL(allowed).origin)
    throw new Error(
      "Die Anfrage stammt nicht von der konfigurierten App-Adresse.",
    );
}
