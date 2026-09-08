"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/timetable", label: "Timetable" },
  { href: "/admin/teachers", label: "Teachers" },
  { href: "/admin/absences", label: "Absences" },
  { href: "/admin/substitutions", label: "Substitutions" },
  { href: "/admin/rules", label: "Rules" },
  { href: "/admin/import-report", label: "Import Report" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {links.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-brand-secondary text-brand-primary"
                : "text-white/85 hover:bg-white/10 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
