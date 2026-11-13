import Link from "next/link";
import { Download, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { roleLabels } from "@/lib/roles";
import { PasswordForm } from "@/components/forms";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Mein Konto" };
export default async function Account() {
  const user = await requireUser();
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="section-kicker">PERSÖNLICHER BEREICH</span>
          <h1>Dein Konto. Dein Zugang.</h1>
          <p>
            Verwalte dein Passwort und behalte deine Berechtigungen im Blick.
          </p>
        </div>
      </div>
      {user.mustChangePassword && (
        <div className="feedback notice" role="status">
          <strong>Bitte zuerst dein Startpasswort ändern.</strong>
          <p>Danach ist der Vereinsbereich für dich freigeschaltet.</p>
        </div>
      )}
      <div className="account-grid">
        <section className="panel padded">
          <div className="panel-title">
            <UserRound size={22} />
            <h2>Mein Profil</h2>
          </div>
          <dl className="profile-data">
            <dt>Name</dt>
            <dd>{user.name}</dd>
            <dt>E-Mail-Adresse</dt>
            <dd>{user.email}</dd>
            <dt>Meine Rollen</dt>
            <dd className="role-badges">
              {user.roles.map((r) => (
                <span className="badge" key={r}>
                  {roleLabels[r]}
                </span>
              ))}
            </dd>
          </dl>
          <p className="form-note">
            Änderungen an deinem Zugang übernimmt ein Superadministrator.
          </p>
          {!user.mustChangePassword && (
            <Button asChild variant="outline">
              <a href="/api/me/export">
                <Download size={16} />
                Meine Daten exportieren
              </a>
            </Button>
          )}
        </section>
        <section className="panel padded">
          <div className="panel-title">
            <LockKeyhole size={22} />
            <h2>Passwort & Sicherheit</h2>
          </div>
          <PasswordForm />
          {!user.mustChangePassword && (
            <Link className="return-link" href="/">
              Zum Dashboard →
            </Link>
          )}
        </section>
      </div>
      <section className="panel padded roadmap" id="ausbau">
        <div className="panel-title">
          <ShieldCheck size={22} />
          <h2>Entwicklungsstand</h2>
        </div>
        <p className="muted">
          Fertige Funktionen statt leerer Menüpunkte. Jede Phase wird vor dem
          weiteren Ausbau geprüft.
        </p>
        <ol>
          {[
            [
              "Grundsystem",
              "Anmeldung, Rollen, Dashboard, PostgreSQL, PWA und Benutzerkonten.",
            ],
            [
              "Mitglieder & Dienste",
              "Mannschaften, Dienstplanung, Dienstanmeldung, Diensttausch und Stunden.",
            ],
            [
              "Lager & Einkauf",
              "Artikel, Lagerbewegungen, Inventur und Bestellungen.",
            ],
            [
              "Checklisten & Aufgaben",
              "Vorlagen, dienstbezogene Checklisten und Schadensmeldungen.",
            ],
            [
              "Veranstaltungen",
              "Spieltage, Personalbedarf und Materialplanung.",
            ],
            [
              "Theke & Finanzen",
              "Interne Verkaufserfassung, Kassenabschlüsse und Finanzen.",
            ],
            [
              "Erweiterungen",
              "Benachrichtigungen, Auswertungen, Exporte und Barcode-Funktionen.",
            ],
          ].map(([name, description], i) => (
            <li key={name}>
              <span className={"phase-number " + (i === 0 ? "ready" : "")}>
                {i + 1}
              </span>
              <div>
                <h3>
                  {name}
                  <span className={"badge " + (i === 0 ? "green" : "")}>
                    {i === 0 ? "Umgesetzt" : "Geplant"}
                  </span>
                </h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
