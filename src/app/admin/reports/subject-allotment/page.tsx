import { createClient } from "@/lib/supabase/server";
import { getViewingSession } from "@/lib/session-context";
import { SessionBanner } from "@/components/session-banner";
import { loadSubjectAllotment } from "@/lib/exports/subject-allotment";

export default async function SubjectAllotmentPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; classId?: string }>;
}) {
  const { subject: subjectId, classId } = await searchParams;
  const supabase = await createClient();
  const viewing = await getViewingSession(supabase);

  const [{ data: subjects }, { data: classes }] = await Promise.all([
    supabase.from("subjects").select("id, name").order("name", { ascending: true }),
    supabase.from("classes").select("id, name, stream").eq("session_id", viewing.id).order("display_order", { ascending: true }),
  ]);

  const rows = subjectId ? await loadSubjectAllotment(supabase, subjectId, viewing.id, classId || undefined) : [];
  const selectedSubject = subjects?.find((s) => s.id === subjectId);

  const query = new URLSearchParams();
  if (subjectId) query.set("subject", subjectId);
  if (classId) query.set("classId", classId);
  query.set("session", viewing.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Subject-wise Teacher Allotment</h1>
      <p className="mt-1 text-sm text-brand-neutral">
        Every class/section currently being taught a subject, and by whom.
      </p>

      <SessionBanner session={viewing} />

      <form className="mt-6 flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-slate-600">Subject *</span>
          <select
            name="subject"
            defaultValue={subjectId ?? ""}
            required
            className="rounded border border-slate-300 px-2 py-1.5"
          >
            <option value="" disabled>
              Select a subject…
            </option>
            {subjects?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-slate-600">Class (optional)</span>
          <select
            name="classId"
            defaultValue={classId ?? ""}
            className="rounded border border-slate-300 px-2 py-1.5"
          >
            <option value="">All classes</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.stream ? ` (${c.stream})` : ""}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="rounded-md bg-brand-primary px-4 py-1.5 text-sm font-medium text-white"
        >
          Filter
        </button>

        {subjectId && (
          <a
            href={`/api/reports/subject-allotment?${query.toString()}`}
            className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-600"
          >
            Download Excel
          </a>
        )}
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Class</th>
              <th className="px-3 py-2 font-medium">Stream</th>
              <th className="px-3 py-2 font-medium">Section</th>
              <th className="px-3 py-2 font-medium">Teacher</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.className}</td>
                <td className="px-3 py-2">{r.stream ?? ""}</td>
                <td className="px-3 py-2">{r.sectionName}</td>
                <td className="px-3 py-2">{r.teacherName}</td>
              </tr>
            ))}
            {subjectId && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No one is currently teaching {selectedSubject?.name ?? "this subject"}
                  {classId ? " in that class" : ""}.
                </td>
              </tr>
            )}
            {!subjectId && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Select a subject to see who teaches it.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
