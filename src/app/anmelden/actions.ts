"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate } from "@/lib/auth-service";
import { assertOrigin, COOKIE_NAME, cookieOptions } from "@/lib/auth";
import { loginSchema, type ActionState } from "@/lib/validation";
export async function login(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: data.get("email"),
    password: data.get("password"),
  });
  if (!parsed.success)
    return { error: "Bitte E-Mail-Adresse und Passwort prüfen." };
  let destination = "/";
  try {
    await assertOrigin();
    const result = await authenticate(parsed.data.email, parsed.data.password);
    if (!result.ok)
      return {
        error:
          "Anmeldung nicht möglich. Prüfe deine Zugangsdaten oder versuche es in 15 Minuten erneut.",
      };
    (await cookies()).set(
      COOKIE_NAME,
      result.token,
      cookieOptions(result.expiresAt),
    );
    destination = result.mustChangePassword ? "/konto?erststart=1" : "/";
  } catch {
    return {
      error:
        "Anmeldung derzeit nicht verfügbar. Bitte prüfe die App-Adresse oder kontaktiere die Administration.",
    };
  }
  redirect(destination);
}
