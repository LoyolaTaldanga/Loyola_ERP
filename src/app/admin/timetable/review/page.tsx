import * as fs from "node:fs";
import * as path from "node:path";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DAY_ABBR } from "@/lib/timetable-grid";
import { getViewingSession, isSessionEditable } from "@/lib/session-context";
import { SessionBanner } from "@/components/session-banner";
import { AmbiguousRow } from "./ambiguous-row";
import { UnresolvedCodeRow } from "./unresolved-code-row";

interface ReportMatch {
  className: string;
  stream: string | null;
  sectionName: string;
  section: string;
  dayOfWeek: number;
  periodNumber: number;
  classWiseSubject?: string;
  teacherWiseSubject?: string;
  subject?: string;
  teacherName: string;
}

interface AmbiguousItem {
  className: string;
  stream: string | null;
  sectionName: string;
  section: string;
  dayOfWeek: number;
  periodNumber: number;
  classWiseSubject: string;
  candidates: { teacherName: string; subjectRaw: string }[];
}

interface ImportReport {
  crossValidation: {
    mismatches: ReportMatch[];
    ambiguous: AmbiguousItem[];
    unresolvedCodes: { code: string; count: number }[];
  };
}

function readReport(): ImportReport | null {
  try {
    const filePath = path.join(process.cwd(), "scripts/import-report.json");
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

export default async function TimetableReviewPage() {
  const report = readReport();
  const supabase = await createClient();
  const viewing = await getViewingSession(supabase);
  const readOnly = !isSessionEditable(viewing.status);

  const { data: sections } = await supabase
    .from("sections")
    .select("id, name, classes(name, stream, display_order)")
    .eq("session_id", viewing.id)
    .order("name");
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, stream, display_order")
    .eq("session_id", viewing.id)
    .order("display_order");

  const sectionIdByKey = new Map<string, string>();
  for (const s of sections ?? []) {
    const cls = s.classes as unknown as { name: string; stream: string | null } | null;
    if (!cls) continue;
    sectionIdByKey.set(`${cls.name}|${cls.stream ?? ""}|${s.name}`, s.id);
  }

  const sectionOptions = (sections ?? [])
    .map((s) => {
      const cls = s.classes as unknown as { name: string; stream: string | null; display_order: number } | null;
      if (!cls) return null;
      return {
        id: s.id,
        label: `${cls.name}${cls.stream ? ` (${cls.stream})` : ""} — ${s.name}`,
        order: cls.display_order,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => a.order - b.order);

  const classOptions = (classes ?? []).map((c) => ({
    id: c.id,
    label: `${c.name}${c.stream ? ` (${c.stream})` : ""}`,
  }));

  if (!report) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-brand-primary">Review Import Issues</h1>
        <p className="mt-4 text-sm text-slate-400">
          No import report found. Run <code className="font-mono">npm run import:excel</code> first.
        </p>
      </div>
    );
  }

  const { mismatches, ambiguous, unresolvedCodes } = report.crossValidation;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-primary">Review Import Issues</h1>
        <Link href="/admin/timetable" className="text-sm text-brand-primary hover:underline">
          ← Back to timetable
        </Link>
      </div>
      <p className="mt-1 text-sm text-brand-neutral">
        Data-quality issues found while cross-validating the Class-wise and Teacher-wise Excel
        files. Resolve them here instead of editing the raw report.
      </p>

      <div className="mt-4">
        <SessionBanner session={viewing} />
      </div>

      <Section title={`Unresolved section codes (${unresolvedCodes.length})`}>
        <p className="mb-3 text-sm text-slate-500">
          These codes from the Teacher-wise sheet couldn&apos;t be matched to a known section (bare
          grade with no letter, e.g. &quot;XI&quot;, or a typo like &quot;VIIII A&quot;). Pick what
          they should have meant.
        </p>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Occurrences</th>
              <th className="px-3 py-2 font-medium">Resolve to</th>
            </tr>
          </thead>
          <tbody>
            {unresolvedCodes.map((u) => (
              <UnresolvedCodeRow
                key={u.code}
                codeRaw={u.code}
                count={u.count}
                sections={sectionOptions}
                classes={classOptions}
                readOnly={readOnly}
              />
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Ambiguous slots (${ambiguous.length})`}>
        <p className="mb-3 text-sm text-slate-500">
          More than one teacher-wise entry claimed the same section/day/period. Pick the correct
          teacher.
        </p>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Section</th>
              <th className="px-3 py-2 font-medium">Day/Period</th>
              <th className="px-3 py-2 font-medium">Subject</th>
              <th className="px-3 py-2 font-medium">Resolve</th>
            </tr>
          </thead>
          <tbody>
            {ambiguous.map((a, i) => (
              <AmbiguousRow key={i} item={a} sessionId={viewing.id} readOnly={readOnly} />
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Mismatches (${mismatches.length})`}>
        <p className="mb-3 text-sm text-slate-500">
          The Class-wise and Teacher-wise sheets disagreed on the subject for these slots (the
          teacher assignment itself is usually still correct — class-wise subject was trusted at
          import time). Jump to the cell to fix the subject if needed.
        </p>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Section</th>
              <th className="px-3 py-2 font-medium">Day/Period</th>
              <th className="px-3 py-2 font-medium">Class-wise</th>
              <th className="px-3 py-2 font-medium">Teacher-wise</th>
              <th className="px-3 py-2 font-medium">Teacher</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {mismatches.map((m, i) => {
              const sectionId = sectionIdByKey.get(`${m.className}|${m.stream ?? ""}|${m.sectionName}`);
              return (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2">{m.section}</td>
                  <td className="px-3 py-2">
                    {DAY_ABBR[m.dayOfWeek]} / P{m.periodNumber}
                  </td>
                  <td className="px-3 py-2">{m.classWiseSubject}</td>
                  <td className="px-3 py-2">{m.teacherWiseSubject}</td>
                  <td className="px-3 py-2">{m.teacherName}</td>
                  <td className="px-3 py-2">
                    {sectionId && (
                      <Link
                        href={`/admin/timetable?section=${sectionId}`}
                        className="text-brand-primary hover:underline"
                      >
                        Go to cell →
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <h2 className="mb-2 font-semibold text-brand-primary">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {children}
      </div>
    </div>
  );
}
