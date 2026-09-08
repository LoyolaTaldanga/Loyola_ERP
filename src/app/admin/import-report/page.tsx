import * as fs from "node:fs";
import * as path from "node:path";

interface ImportReport {
  generatedAt: string;
  classesUpserted: number;
  sectionsUpserted: number;
  subjectsUpserted: number;
  timetableEntriesUpserted: number;
  crossValidation: {
    confirmed: number;
    unmatched: number;
    mismatches: {
      section: string;
      day: number;
      period: number;
      classWiseSubject: string;
      teacherWiseSubject: string;
      teacherName: string;
    }[];
    ambiguous: {
      section: string;
      day: number;
      period: number;
      classWiseSubject: string;
      candidates: { teacherName: string; subjectRaw: string }[];
    }[];
    unresolvedCodes: { code: string; count: number }[];
  };
  teacherWiseSkippedBlocks: string[];
  teacherRosterFromTeacherWiseSheet: string[];
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

function readReport(): ImportReport | null {
  try {
    const filePath = path.join(process.cwd(), "scripts/import-report.json");
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

export default function ImportReportPage() {
  const report = readReport();

  if (!report) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-brand-primary">Import Report</h1>
        <p className="mt-4 text-sm text-slate-400">
          No import report found. Run <code className="font-mono">npm run import:excel</code> first.
        </p>
      </div>
    );
  }

  const { crossValidation } = report;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Import Report</h1>
      <p className="mt-1 text-sm text-brand-neutral">
        Generated {new Date(report.generatedAt).toLocaleString()}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Classes", report.classesUpserted],
          ["Sections", report.sectionsUpserted],
          ["Subjects", report.subjectsUpserted],
          ["Timetable entries", report.timetableEntriesUpserted],
          ["Confirmed matches", crossValidation.confirmed],
          ["Unmatched", crossValidation.unmatched],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-brand-primary">{value}</p>
          </div>
        ))}
      </div>

      <Section title={`Mismatches (${crossValidation.mismatches.length})`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Section</th>
              <th className="px-3 py-2 font-medium">Day/Period</th>
              <th className="px-3 py-2 font-medium">Class-wise subject</th>
              <th className="px-3 py-2 font-medium">Teacher-wise subject</th>
              <th className="px-3 py-2 font-medium">Teacher</th>
            </tr>
          </thead>
          <tbody>
            {crossValidation.mismatches.map((m, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-3 py-2">{m.section}</td>
                <td className="px-3 py-2">
                  {DAY_NAMES[m.day]} / P{m.period}
                </td>
                <td className="px-3 py-2">{m.classWiseSubject}</td>
                <td className="px-3 py-2">{m.teacherWiseSubject}</td>
                <td className="px-3 py-2">{m.teacherName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Ambiguous (${crossValidation.ambiguous.length})`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Section</th>
              <th className="px-3 py-2 font-medium">Day/Period</th>
              <th className="px-3 py-2 font-medium">Subject</th>
              <th className="px-3 py-2 font-medium">Candidate teachers</th>
            </tr>
          </thead>
          <tbody>
            {crossValidation.ambiguous.map((a, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-3 py-2">{a.section}</td>
                <td className="px-3 py-2">
                  {DAY_NAMES[a.day]} / P{a.period}
                </td>
                <td className="px-3 py-2">{a.classWiseSubject}</td>
                <td className="px-3 py-2">
                  {a.candidates.map((c) => `${c.teacherName} (${c.subjectRaw})`).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Unresolved codes (${crossValidation.unresolvedCodes.length})`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Occurrences</th>
            </tr>
          </thead>
          <tbody>
            {crossValidation.unresolvedCodes.map((u) => (
              <tr key={u.code} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono">{u.code || "(blank)"}</td>
                <td className="px-3 py-2">{u.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {report.teacherWiseSkippedBlocks.length > 0 && (
        <Section title={`Skipped blocks (${report.teacherWiseSkippedBlocks.length})`}>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {report.teacherWiseSkippedBlocks.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </Section>
      )}
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
