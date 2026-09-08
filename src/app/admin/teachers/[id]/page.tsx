import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EditableTimetableGrid, type EditableCellData } from "@/components/editable-timetable-grid";
import { AssignClassTeacher, UnassignClassTeacherButton } from "./assign-class-teacher";

function classLabel(cls: { name: string; stream: string | null } | null): string {
  if (!cls) return "";
  return `${cls.name}${cls.stream ? ` (${cls.stream})` : ""}`;
}

export default async function TeacherProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: teacher } = await supabase.from("teachers").select("*").eq("id", id).single();
  if (!teacher) notFound();

  const [
    { data: periodSlots },
    { data: subjects },
    { data: allTeachers },
    { data: teacherSubjects },
    { data: entries },
    { data: classTeacherSections },
    { data: allSections },
  ] = await Promise.all([
    supabase.from("period_slots").select("*").order("period_number", { ascending: true }),
    supabase.from("subjects").select("id, name").order("name", { ascending: true }),
    supabase.from("teachers").select("id, name").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("teacher_subjects").select("teacher_id, subject_id"),
    supabase
      .from("timetable_entries")
      .select("section_id, day_of_week, period_slot_id, subject_id, teacher_id, is_practical, subjects(name), sections(name, classes(name, stream))")
      .eq("teacher_id", id),
    supabase
      .from("sections")
      .select("id, name, classes(name, stream, display_order)")
      .eq("class_teacher_id", id),
    supabase
      .from("sections")
      .select("id, name, class_teacher_id, classes(name, stream, display_order), teachers(name)")
      .order("name", { ascending: true }),
  ]);

  const qualifiedTeacherIdsBySubject: Record<string, string[]> = {};
  for (const ts of teacherSubjects ?? []) {
    (qualifiedTeacherIdsBySubject[ts.subject_id] ??= []).push(ts.teacher_id);
  }

  const cells: EditableCellData[] = (entries ?? []).map((e) => {
    const section = e.sections as unknown as {
      name: string;
      classes: { name: string; stream: string | null } | null;
    } | null;
    const label = section ? `${classLabel(section.classes)} — ${section.name}` : "";
    return {
      section_id: e.section_id,
      day_of_week: e.day_of_week,
      period_slot_id: e.period_slot_id,
      subject_id: e.subject_id,
      subject_name: (e.subjects as unknown as { name: string } | null)?.name ?? null,
      teacher_id: e.teacher_id,
      teacher_name: teacher.name,
      is_practical: e.is_practical,
      sectionLabel: label,
      jumpHref: `/admin/timetable?section=${e.section_id}&day=${e.day_of_week}&period=${e.period_slot_id}`,
    };
  });

  const sectionOptions = (allSections ?? [])
    .map((s) => {
      const cls = s.classes as unknown as { name: string; stream: string | null; display_order: number } | null;
      const currentTeacher = s.teachers as unknown as { name: string } | null;
      if (!cls) return null;
      return {
        id: s.id,
        label: `${classLabel(cls)} — ${s.name}`,
        currentTeacherId: s.class_teacher_id,
        currentTeacherName: currentTeacher?.name ?? null,
        order: cls.display_order,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => a.order - b.order);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand-primary">{teacher.name}</h1>
          <p className="mt-1 text-sm text-brand-neutral">
            {teacher.username} · Group {teacher.group} · {teacher.is_active ? "Active" : "Inactive"}
          </p>
        </div>
        <Link href="/admin/teachers" className="text-sm text-brand-primary hover:underline">
          ← Back to teachers
        </Link>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-brand-primary">Class Teacher Of</h2>
        {classTeacherSections?.length ? (
          <ul className="mt-2 space-y-1 text-sm">
            {classTeacherSections.map((s) => {
              const cls = s.classes as unknown as { name: string; stream: string | null } | null;
              const label = `${classLabel(cls)} — ${s.name}`;
              return (
                <li key={s.id} className="flex items-center justify-between">
                  <span>{label}</span>
                  <UnassignClassTeacherButton sectionId={s.id} sectionLabel={label} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Not currently a class teacher of any section.</p>
        )}

        <div className="mt-4 border-t border-slate-100 pt-4">
          <AssignClassTeacher teacherId={id} sections={sectionOptions} />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-2 font-semibold text-brand-primary">Weekly Timetable</h2>
        <p className="mb-3 text-sm text-slate-500">
          Click a cell to edit. Use the ↗ link to jump to that class&apos;s full timetable for
          context.
        </p>
        <EditableTimetableGrid
          periodSlots={periodSlots ?? []}
          cells={cells}
          subjects={subjects ?? []}
          teachers={allTeachers ?? []}
          qualifiedTeacherIdsBySubject={qualifiedTeacherIdsBySubject}
        />
      </div>
    </div>
  );
}
