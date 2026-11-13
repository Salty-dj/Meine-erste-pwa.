import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPin,
  ShieldCheck,
  Users,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { requireReadyUser } from "@/lib/auth";
import { getDashboard } from "@/lib/dashboard";
const dateFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "short",
  timeZone: "Europe/Berlin",
});
const timeFormat = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const money = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof CalendarDays;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export default async function Dashboard() {
  const user = await requireReadyUser();
  const data = await getDashboard(user);
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="section-kicker">
            <span className="blue-dot" /> GEMEINSAM ORGANISIERT
          </span>
          <h1>
            Hallo {user.name.split(" ")[0]},<br className="mobile-break" />{" "}
            schön, dass du da bist.
          </h1>
          <p>Dein Verein. Deine Aufgaben. Dein Überblick.</p>
        </div>
        <div className="today-label">
          <CalendarDays size={16} />
          {new Intl.DateTimeFormat("de-DE", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "Europe/Berlin",
          }).format(new Date())}
        </div>
      </div>
      <div className="welcome-banner">
        <div>
          <span className="banner-tag">TSV DENKENDORF · HANDBALL</span>
          <h2>Hinter jedem Spiel steht ein starkes Team.</h2>
          <p>
            Hier wächst unser gemeinsamer Vereinsraum – Schritt für Schritt.
          </p>
        </div>
        <div className="handball-art" aria-hidden="true">
          <span />
          <i />
          <b>TSV</b>
        </div>
      </div>
      <section className="stat-grid" aria-label="Aktuelle Übersicht">
        {[
          {
            label: "Kommende Termine",
            value: data.events.length,
            icon: CalendarDays,
            tone: "blue",
            note: "Nächste Veranstaltungen (max. 4)",
          },
          {
            label: "Meine nächsten Dienste",
            value: data.assignments.length,
            icon: Clock3,
            tone: "purple",
            note: "Kommende Einteilungen (max. 4)",
          },
          {
            label: "Freie Dienstplätze",
            value: data.openPositions,
            icon: Users,
            tone: "orange",
            note: "Noch offene Helferplätze",
          },
          {
            label: data.club ? "Offene Aufgaben" : "Meine offenen Aufgaben",
            value: data.taskCount,
            icon: ClipboardList,
            tone: "green",
            note: "Gemeinsam etwas bewegen",
          },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-card-top">
              <span>{s.label}</span>
              <span className={"stat-symbol " + s.tone}>
                <s.icon size={20} />
              </span>
            </div>
            <strong>{String(s.value).padStart(2, "0")}</strong>
            <small>{s.note}</small>
          </div>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Spieltage & Veranstaltungen</h2>
              <p>Die nächsten Termine im Verein</p>
            </div>
            <CalendarDays size={20} />
          </div>
          {data.events.length ? (
            <div className="data-list">
              {data.events.map((e) => (
                <div className="event-row" key={e.id}>
                  <span className="date-tile">
                    {dateFormat.format(e.startsAt)}
                  </span>
                  <div>
                    <h3>{e.title}</h3>
                    <span>
                      <MapPin size={12} />
                      {e.location} · {timeFormat.format(e.startsAt)} Uhr
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={CalendarDays}
              title="Noch keine Termine geplant"
              text="Sobald Veranstaltungen angelegt sind, erscheinen hier die nächsten Spieltage und Vereinstermine."
            />
          )}
          <div className="panel-foot">
            Veranstaltungsverwaltung folgt in Phase 5.
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Meine Dienste</h2>
              <p>Dein Einsatz macht den Unterschied</p>
            </div>
            <Clock3 size={20} />
          </div>
          {data.assignments.length ? (
            <div className="data-list">
              {data.assignments.map((a) => (
                <div className="event-row" key={a.id}>
                  <span className="row-icon">
                    <Clock3 size={20} />
                  </span>
                  <div>
                    <h3>{a.shift.type.name}</h3>
                    <span>
                      {dateFormat.format(a.shift.startsAt)} ·{" "}
                      {timeFormat.format(a.shift.startsAt)}–
                      {timeFormat.format(a.shift.endsAt)} Uhr
                    </span>
                    <small>{a.shift.location}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={CheckCircle2}
              title="Aktuell keine Dienste eingeteilt"
              text="Deine persönlichen Dienste erscheinen hier, sobald die Dienstplanung eingerichtet ist."
            />
          )}
          <div className="panel-foot">
            Dienstplanung und Dienstanmeldung folgen in Phase 2.
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{data.club ? "Offene Aufgaben" : "Meine Aufgaben"}</h2>
              <p>Was als Nächstes ansteht</p>
            </div>
            <ClipboardList size={20} />
          </div>
          {data.openTasks.length ? (
            <div className="data-list">
              {data.openTasks.map((t) => (
                <div className="task-row" key={t.id}>
                  <span
                    className={"task-dot " + (t.highPriority ? "urgent" : "")}
                  />
                  <div>
                    <h3>{t.title}</h3>
                    <span>
                      {t.dueAt
                        ? `Fällig am ${dateFormat.format(t.dueAt)}`
                        : "Ohne Fälligkeitsdatum"}
                    </span>
                  </div>
                  {t.highPriority && <span className="badge orange">Hoch</span>}
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={ClipboardList}
              title="Alles aufgeräumt"
              text="Hier findest du zukünftig deine offenen Aufgaben und Schadensmeldungen."
            />
          )}
          <div className="panel-foot">
            Aufgaben und Checklisten folgen in Phase 4.
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Mitteilungen</h2>
              <p>Das solltest du wissen</p>
            </div>
            <Bell size={20} />
          </div>
          {data.notifications.length ? (
            <div className="data-list">
              {data.notifications.map((n) => (
                <div className="notification" key={n.id}>
                  <span className="row-icon">
                    <Bell size={18} />
                  </span>
                  <div>
                    <h3>{n.title}</h3>
                    <p>{n.body}</p>
                    <small>{dateFormat.format(n.createdAt)}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={Bell}
              title="Du bist auf dem aktuellen Stand"
              text="Es liegen keine persönlichen Mitteilungen vor. Automatische Erinnerungen folgen mit den Fachmodulen."
            />
          )}
          <div className="panel-foot">
            <ShieldCheck size={13} /> Nur für dein Benutzerkonto sichtbar.
          </div>
        </section>
      </div>
      {(data.club || data.stock || data.finance) && (
        <section className="admin-overview">
          <div className="section-heading">
            <div>
              <span className="section-kicker">VERWALTUNGSÜBERBLICK</span>
              <h2>Die Zahlen hinter dem Spiel.</h2>
            </div>
            <span className="badge">Nach deiner Berechtigung</span>
          </div>
          <div className="admin-metrics">
            {data.club && (
              <div>
                <span>Dienstbesetzung</span>
                <strong>
                  {data.coverage === null ? "–" : `${data.coverage} %`}
                </strong>
                <div className="progress-track">
                  <span style={{ width: `${data.coverage ?? 0}%` }} />
                </div>
                <small>
                  {data.coverage === null
                    ? "Noch keine Dienste geplant"
                    : "Anteil besetzter Plätze"}
                </small>
              </div>
            )}
            {data.stock && (
              <div>
                <span>Lagerwert</span>
                <strong>{money(data.stockValueCents)}</strong>
                <small>
                  {data.stockWarnings.length} Artikel unter Mindestbestand
                </small>
              </div>
            )}
            {data.finance && (
              <div>
                <span>Einnahmen minus Ausgaben</span>
                <strong>{money(data.financeCents)}</strong>
                <small>Summe aller internen Buchungen</small>
              </div>
            )}
          </div>
          {data.stock && data.stockWarnings.length > 0 && (
            <div className="stock-warnings">
              <h3>
                <Warehouse size={17} />
                Mindestbestandswarnungen
              </h3>
              {data.stockWarnings.map((p) => (
                <p key={p.id}>
                  {p.name}: {p.quantity} {p.unit} · Mindestbestand{" "}
                  {p.minimumStock}
                </p>
              ))}
            </div>
          )}
          {data.teamHours.length > 0 && (
            <div className="team-hours">
              <h3>Dienststunden nach Mannschaft</h3>
              <p className="muted text-sm">
                Bei Mehrfachzugehörigkeit wird die Person in jeder zugehörigen
                Mannschaft berücksichtigt.
              </p>
              {data.teamHours.map((t) => (
                <div key={t.name}>
                  <span>{t.name}</span>
                  <strong>
                    {t.hours.toLocaleString("de-DE", {
                      maximumFractionDigits: 1,
                    })}{" "}
                    Std.
                  </strong>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <div className="foundation-note">
        <ShieldCheck size={20} />
        <div>
          <strong>Eine sichere Basis für unseren Verein.</strong>
          <p>
            Anmeldung, Rollen und Datenbank sind eingerichtet. Die Fachmodule
            werden nacheinander ergänzt.
          </p>
        </div>
        <Link href="/konto#ausbau" aria-label="Entwicklungsstand ansehen">
          <ArrowUpRight size={19} />
        </Link>
      </div>
    </>
  );
}
