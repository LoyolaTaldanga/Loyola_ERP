import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getViewingSession, isSessionEditable } from "@/lib/session-context";
import { SessionBanner } from "@/components/session-banner";
import { SectionSelect } from "@/components/section-select";
import { EditableTimetableGrid, type EditableCellData } from "@/components/editable-timetable-grid";
import { CellHighlighter } from "@/components/cell-highlighter";
import { LinkTeachersButton } from "./link-teachers-button";

export default async function AdminTimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; day?: string; period?: string }>;
}) {
  const { section: selectedSectionId, day, period } = await searchParams;
  const supabase = await createClient();
  const viewing = await getViewingSession(supabase);
  const readOnly = !isSessionEditable(viewing.status);

  const [{ data: classes }, { data: periodSlots }, { data: subjects }, { data: teachers }, { data: teacherSubjects }] =
    await Promise.all([
      supabase
        .from("classes")
        .select("id, name, stream, display_order, sections(id, name)")
        .eq("session_id", viewing.id)
        .order("display_order", { ascending: true }),
      supabase.from("period_slots").select("*").order("period_number", { ascending: true }),
      supabase.from("subjects").select("id, name").order("name", { ascending: true }),
      supabase.from("teachers").select("id, name").eq("is_active", true).order("name", { ascending: true }),
      supabase.from("teacher_subjects").select("teacher_id, subject_id"),
    ]);

  const sectionId =
    selectedSectionId ?? classes?.find((c) => c.sections?.length)?.sections?.[0]?.id;

  const qualifiedTeacherIdsBySubject: Record<string, string[]> = {};
  for (const ts of teacherSubjects ?? []) {
    (qualifiedTeacherIdsBySubject[ts.subject_id] ??= []).push(ts.teacher_id);
  }

  let cells: EditableCellData[] = [];

  if (sectionId) {
    const { data: entries } = await supabase
      .from("timetable_entries")
      .select("day_of_week, period_slot_id, subject_id, teacher_id, is_practical, subjects(name), teachers(name)")
      .eq("section_id", sectionId)
      .eq("session_id", viewing.id);

    cells = (entries ?? []).map((e) => ({
      section_id: sectionId,
      day_of_week: e.day_of_week,
      period_slot_id: e.period_slot_id,
      subject_id: e.subject_id,
      subject_name: (e.subjects as unknown as { name: string } | null)?.name ?? null,
      teacher_id: e.teacher_id,
      teacher_name: (e.teachers as unknown as { name: string } | null)?.name ?? null,
      is_practical: e.is_practical,
    }));
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand-primary">Timetable</h1>
          <p className="mt-1 text-sm text-brand-neutral">
            Click a cell to edit its subject and teacher. Changes save immediately.
          </p>
        </div>
        <Link href="/admin/timetable/review" className="text-sm text-brand-primary hover:underline">
          Review import issues →
        </Link>
      </div>

      <SessionBanner session={viewing} />

      {!readOnly && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <LinkTeachersButton sessionId={viewing.id} />
        </div>
      )}

      {sectionId && (
        <div className="mt-6 flex items-end justify-between gap-4">
          <SectionSelect
            sectionId={sectionId}
            options={
              classes?.flatMap(
                (cls) =>
                  cls.sections?.map((sec) => ({
                    id: sec.id,
                    label: `${cls.name}${cls.stream ? ` (${cls.stream})` : ""} — ${sec.name}`,
                  })) ?? []
              ) ?? []
            }
          />
          <a
            href={`/api/timetable/section/${sectionId}`}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600"
          >
            Download Excel
          </a>
        </div>
      )}

      <div className="mt-6">
        {sectionId ? (
          <EditableTimetableGrid
            defaultSectionId={sectionId}
            periodSlots={periodSlots ?? []}
            cells={cells}
            subjects={subjects ?? []}
            teachers={teachers ?? []}
            qualifiedTeacherIdsBySubject={qualifiedTeacherIdsBySubject}
            readOnly={readOnly}
          />
        ) : (
          <p className="text-sm text-slate-400">No classes/sections yet. Run the Excel importer first.</p>
        )}
      </div>

      {day && period && <CellHighlighter dayOfWeek={Number(day)} periodSlotId={period} />}
    </div>
  );
}
