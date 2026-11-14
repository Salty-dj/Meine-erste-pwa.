"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, Settings, Users } from "lucide-react";
export function Navigation({
  admin,
  members,
  ready,
}: {
  admin: boolean;
  members: boolean;
  ready: boolean;
}) {
  const path = usePathname();
  const items = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    ...(ready
      ? [{ href: "/dienste", label: "Dienste", icon: CalendarDays }]
      : []),
    ...(members
      ? [{ href: "/mitglieder", label: "Mitglieder & Teams", icon: Users }]
      : []),
    ...(admin
      ? [{ href: "/benutzer", label: "Benutzer & Rollen", icon: Users }]
      : []),
    { href: "/konto", label: "Mein Konto", icon: Settings },
  ];
  return (
    <nav aria-label="Hauptnavigation" className="main-nav">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={path === href ? "current" : ""}
          aria-current={path === href ? "page" : undefined}
        >
          <Icon size={19} />
          <span>{label}</span>
          {path === href && <i />}
        </Link>
      ))}
    </nav>
  );
}
