import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  CalendarDays,
  ShieldCheck,
  Users,
  Warehouse,
} from "lucide-react";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "@/components/forms";
export const dynamic = "force-dynamic";
export const metadata = { title: "Anmelden" };
export default async function Login() {
  if (await currentUser()) redirect("/");
  return (
    <main id="main" className="login-page">
      <section className="login-story">
        <div className="login-brand">
          <span className="crest">
            TSV<small>DENKENDORF</small>
          </span>
          <span>
            TSV Vereinsmanager<small>HANDBALLABTEILUNG</small>
          </span>
        </div>
        <span className="story-label">
          MEHR ZEIT FÜR DAS, WAS UNS VERBINDET.
        </span>
        <h1>
          Unser Verein.
          <br />
          Unser Team.
          <br />
          <span>Alles im Blick.</span>
        </h1>
        <p>Ein gemeinsamer Ort für die Organisation hinter dem Spielfeld.</p>
        <div className="story-modules">
          <span>
            <Users size={19} /> Menschen verbinden
          </span>
          <span>
            <CalendarDays size={19} /> Gemeinsam planen
          </span>
          <span>
            <Warehouse size={19} /> Überblick behalten
          </span>
        </div>
        <div className="story-footer">
          TSV Denkendorf · Handball <ArrowUpRight size={17} />
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="section-kicker">
            <span className="blue-dot" /> DEIN GESCHÜTZTER VEREINSRAUM
          </span>
          <h2>Schön, dass du da bist.</h2>
          <p className="login-description">
            Melde dich an, um deinen Vereinsbereich zu öffnen.
          </p>
          <LoginForm />
          <div className="security-note">
            <ShieldCheck size={19} />
            <span>
              Persönlicher Zugang. Klare Berechtigungen.
              <small>Keine öffentlichen Mitgliederlisten.</small>
            </span>
          </div>
        </div>
        <p className="login-bottom">TSV Denkendorf · Gemeinsam mehr bewegen.</p>
      </section>
    </main>
  );
}
