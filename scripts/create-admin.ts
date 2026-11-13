import "dotenv/config";
import { stdin, stdout } from "node:process";
import { db } from "../src/lib/db";
import { ensureRoles } from "../src/lib/accounts";
import { hashPassword } from "../src/lib/password";
import { createUserSchema } from "../src/lib/validation";
function hiddenPassword(): Promise<string> {
  if (!stdin.isTTY)
    throw new Error(
      "ADMIN_PASSWORD über eine sichere lokale Umgebungsvariable bereitstellen oder in einem interaktiven Terminal starten.",
    );
  stdout.write(
    "Neues Startpasswort (mindestens 12 Zeichen, unsichtbare Eingabe): ",
  );
  return new Promise((resolve, reject) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", handler);
      stdout.write("\n");
    };
    const handler = (input: string) => {
      for (const char of input) {
        if (char === "\u0003") {
          finish();
          reject(new Error("Abgebrochen."));
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    stdin.on("data", handler);
  });
}
async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => args[args.indexOf(name) + 1];
  if (!args.includes("--email") || !args.includes("--name"))
    throw new Error(
      'Aufruf: npm run db:admin -- --email name@verein.de --name "Vorname Nachname"',
    );
  const password = process.env.ADMIN_PASSWORD ?? (await hiddenPassword());
  delete process.env.ADMIN_PASSWORD;
  const input = createUserSchema.parse({
    email: arg("--email"),
    name: arg("--name"),
    password,
    roles: ["SUPERADMIN"],
  });
  await ensureRoles();
  const hash = await hashPassword(input.password);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(14072000)`;
    if (
      await tx.user.count({
        where: { roles: { some: { roleId: "SUPERADMIN" } }, active: true },
      })
    )
      throw new Error(
        "Ein aktiver Superadministrator existiert bereits. Weitere Konten über die Benutzerverwaltung anlegen.",
      );
    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: hash,
        roles: { create: { roleId: "SUPERADMIN" } },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "INITIAL_ADMIN_CREATED",
        entityType: "User",
        entityId: user.id,
      },
    });
  });
  console.log(
    "Erster Superadministrator angelegt. Beim ersten Anmelden muss das Startpasswort geändert werden.",
  );
}
main()
  .catch((e) => {
    console.error(
      e instanceof Error
        ? e.message
        : "Administrator konnte nicht erstellt werden.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
