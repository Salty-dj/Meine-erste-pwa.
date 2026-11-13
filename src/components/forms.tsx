"use client";
import { useActionState } from "react";
import { LogIn, Plus, Save, ShieldCheck } from "lucide-react";
import type { RoleCode } from "@prisma/client";
import { Button } from "./ui/button";
import { login } from "@/app/anmelden/actions";
import { createUser, updateRoles } from "@/app/(portal)/benutzer/actions";
import { changePassword } from "@/app/(portal)/konto/actions";
import { roleCodes, roleLabels } from "@/lib/roles";
import type { ActionState } from "@/lib/validation";
function Feedback({ state }: { state: ActionState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="feedback error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="feedback success">
          {state.success}
        </p>
      )}
    </>
  );
}
export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="stack">
      <label>
        E-Mail-Adresse
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          placeholder="name@verein.de"
        />
      </label>
      <label>
        Passwort
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          placeholder="Dein persönliches Passwort"
        />
      </label>
      <Feedback state={state} />
      <Button type="submit" disabled={pending}>
        <LogIn size={18} />
        {pending ? "Wird angemeldet …" : "Sicher anmelden"}
      </Button>
      <p className="form-note">
        Noch kein Zugang oder Passwort vergessen? Bitte wende dich an die
        Vereinsadministration.
      </p>
    </form>
  );
}
export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, {});
  return (
    <form action={action} className="stack">
      <label>
        Aktuelles Passwort
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </label>
      <div className="form-grid">
        <label>
          Neues Passwort
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <label>
          Neues Passwort wiederholen
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
      </div>
      <p className="form-note">
        Mindestens 12 Zeichen. Verwende ein langes, einmaliges Passwort. Alle
        anderen Sitzungen werden nach der Änderung beendet.
      </p>
      <Feedback state={state} />
      <Button type="submit" disabled={pending} className="self-start">
        <ShieldCheck size={17} />
        {pending ? "Wird gespeichert …" : "Passwort ändern"}
      </Button>
    </form>
  );
}
function RoleFields({ selected = ["MEMBER"] as RoleCode[] }) {
  return (
    <fieldset>
      <legend>Benutzerrollen</legend>
      <div className="role-grid">
        {roleCodes.map((role) => (
          <label className="check-label" key={role}>
            <input
              type="checkbox"
              name="roles"
              value={role}
              defaultChecked={selected.includes(role)}
            />
            <span>{roleLabels[role]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, {});
  return (
    <form action={action} className="stack">
      <div className="form-grid">
        <label>
          Name
          <input
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
          />
        </label>
        <label>
          E-Mail-Adresse
          <input
            name="email"
            autoComplete="email"
            type="email"
            required
            maxLength={254}
          />
        </label>
      </div>
      <label>
        Einmaliges Startpasswort
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
        />
      </label>
      <p className="form-note">
        Sicher an die Person weitergeben. Beim ersten Anmelden wird eine
        Passwortänderung verlangt. Es werden keine E-Mails automatisch
        verschickt.
      </p>
      <RoleFields />
      <Feedback state={state} />
      <Button type="submit" disabled={pending} className="self-start">
        <Plus size={18} />
        {pending ? "Wird erstellt …" : "Benutzerkonto erstellen"}
      </Button>
    </form>
  );
}
export function RolesForm({
  user,
}: {
  user: { id: string; active: boolean; roles: RoleCode[] };
}) {
  const [state, action, pending] = useActionState(updateRoles, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="userId" value={user.id} />
      <RoleFields selected={user.roles} />
      <label className="check-label">
        <input type="checkbox" name="active" defaultChecked={user.active} />
        Konto aktiv
      </label>
      <p className="form-note">
        Änderungen beenden alle Sitzungen dieses Kontos. Der letzte aktive
        Superadministrator bleibt geschützt.
      </p>
      <Feedback state={state} />
      <Button
        variant="outline"
        type="submit"
        disabled={pending}
        className="self-start"
      >
        <Save size={16} />
        {pending ? "Wird gespeichert …" : "Zugriff speichern"}
      </Button>
    </form>
  );
}
