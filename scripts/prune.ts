import "dotenv/config";
import { db } from "../src/lib/db";
async function main() {
  const now = new Date();
  const authCutoff = new Date(Date.now() - 30 * 86400000);
  const auditCutoff = new Date(Date.now() - 365 * 86400000);
  const result = await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.loginThrottle.deleteMany({ where: { windowStart: { lt: authCutoff } } }),
    db.auditLog.deleteMany({
      where: { action: "LOGIN_FAILED", createdAt: { lt: authCutoff } },
    }),
    db.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
  ]);
  console.log(
    "Bereinigung abgeschlossen:",
    result.map((r) => r.count).join(", "),
  );
}
main()
  .catch(() => {
    console.error("Bereinigung fehlgeschlagen. Datenbankverbindung prüfen.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
