import { createClient } from "@/lib/supabase/server";
import { TimetableTable, type TimetableCellData } from "@/components/timetable-table";
import { SectionSelect } from "@/components/section-select";

export default async function AdminTimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section: selectedSectionId } = await searchParams;
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, stream, display_order, sections(id, name)")
    .order("display_order", { ascending: true });

  const { data: periodSlots } = await supabase
    .from("period_slots")
    .select("*")
    .order("period_number", { ascending: true });

  const sectionId =
    selectedSectionId ?? classes?.find((c) => c.sections?.length)?.sections?.[0]?.id;

  let cells: TimetableCellData[] = [];
  if (sectionId) {
    const { data: entries } = await supabase
      .from("timetable_entries")
      .select("day_of_week, period_slot_id, is_practical, subjects(name), teachers(name)")
      .eq("section_id", sectionId);

    cells = (entries ?? []).map((e) => ({
      day_of_week: e.day_of_week,
      period_slot_id: e.period_slot_id,
      subject_name: (e.subjects as unknown as { name: string } | null)?.name ?? null,
      sub_label: (e.teachers as unknown as { name: string } | null)?.name ?? null,
      is_practical: e.is_practical,
    }));
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Timetable</h1>
      <p className="mt-1 text-sm text-brand-neutral">Read-only view of the master timetable, by class & section.</p>

      {sectionId && (
        <div className="mt-6">
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
        </div>
      )}

      <div className="mt-6">
        {sectionId ? (
          <TimetableTable periodSlots={periodSlots ?? []} cells={cells} />
        ) : (
          <p className="text-sm text-slate-400">No classes/sections yet. Run the Excel importer first.</p>
        )}
      </div>
    </div>
  );
}
