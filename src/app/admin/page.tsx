import Link from "next/link";

const cards = [
  { href: "/admin/timetable", title: "Timetable", desc: "View the master timetable by class & section." },
  { href: "/admin/teachers", title: "Teachers", desc: "Create teacher accounts and manage subject assignments." },
  { href: "/admin/absences", title: "Absences", desc: "Log and review teacher absences." },
  { href: "/admin/substitutions", title: "Substitutions", desc: "Assign and track substitute teachers." },
  { href: "/admin/rules", title: "Rules", desc: "Tune substitution assignment rules." },
];

export default function AdminHomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Admin Dashboard</h1>
      <p className="mt-1 text-sm text-brand-neutral">Loyola School, Taldanga — Timetable & Substitution Management</p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-secondary hover:shadow-md"
          >
            <h2 className="font-semibold text-brand-primary">{card.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
