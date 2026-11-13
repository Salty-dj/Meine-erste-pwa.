import Link from "next/link";
import {
  ArrowUpRight,
  ChevronRight,
  Heart,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { roleLabels, can } from "@/lib/roles";
import { Navigation } from "@/components/navigation";
import { logout } from "./konto/actions";
export const dynamic = "force-dynamic";
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="portal">
      <aside className="sidebar">
        <Link
          className="brand"
          href="/"
          aria-label="TSV Vereinsmanager Startseite"
        >
          <span className="crest">
            TSV<small>DENKENDORF</small>
          </span>
          <span>
            Vereinsmanager<small>HANDBALL · DENKENDORF</small>
          </span>
        </Link>
        <div className="sidebar-caption">DEIN VEREINSRAUM</div>
        <Navigation
          admin={can(user.roles, "accounts") && !user.mustChangePassword}
        />
        <div className="sidebar-future">
          <span className="phase-badge">GRUNDSYSTEM · PHASE 1</span>
          <p>
            Ein Verein.
            <br />
            <strong>Viele Möglichkeiten.</strong>
          </p>
          <span>Mitglieder, Dienste und Lager folgen schrittweise.</span>
          <Link href="/konto#ausbau">
            Entwicklungsstand <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="sidebar-bottom">
          <ShieldCheck size={17} />
          <span>
            Geschützter Vereinsbereich
            <small>Zugang nur mit Benutzerkonto</small>
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            TSV Denkendorf <ChevronRight size={14} />
            <strong>Handball</strong>
          </span>
          <div className="topbar-user">
            <span className="user-names">
              {user.name}
              <small>{roleLabels[user.roles[0]] ?? "Ohne Rolle"}</small>
            </span>
            <span className="avatar">
              {user.name
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")
                .toLocaleUpperCase("de")}
            </span>
            <form action={logout}>
              <button aria-label="Abmelden" className="logout">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>
        <main id="main" className="main-content">
          {children}
        </main>
        <footer className="site-footer">
          <span>
            <Heart size={13} /> Gemeinsam für unseren Verein.
          </span>
          <span>TSV Vereinsmanager · Handball</span>
        </footer>
      </div>
    </div>
  );
}
