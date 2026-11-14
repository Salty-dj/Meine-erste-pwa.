import { db } from "../src/lib/db";
import { bootstrapAdmin } from "../src/lib/bootstrap";
async function main() {
  if (process.env.BOOTSTRAP_ADMIN !== "true") return;
  const input = {
    email: process.env.ADMIN_EMAIL,
    name: process.env.ADMIN_NAME,
    password: process.env.ADMIN_PASSWORD,
    roles: ["SUPERADMIN"],
  };
  // Avoid passing the one-time password to any further child process.
  delete process.env.ADMIN_PASSWORD;
  const created = await bootstrapAdmin(input);
  console.log(
    created
      ? "Erster Administrator angelegt. Startpasswort bei der Anmeldung ändern."
      : "Aktiver Administrator vorhanden; Zugangsdaten bleiben unverändert.",
  );
}
main()
  .catch(() => {
    // Never emit database URLs, input objects or Prisma exceptions containing credentials.
    console.error(
      "Admin-Ersteinrichtung fehlgeschlagen. ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD und Datenbankzugriff prüfen. Es werden keine bestehenden Konten überschrieben.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
