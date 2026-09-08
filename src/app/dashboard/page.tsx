import { getCurrentUser } from "@/lib/auth/get-role";
import { createClient } from "@/lib/supabase/server";
import { TimetableTable, type TimetableCellData } from "@/components/timetable-table";

export default async function DashboardPage() {
  const current = await getCurrentUser();
  const supabase = await createClient();

  const { data: teacher } = await supabase
    .from("teachers")
    .select("name")
    .eq("id", current!.user.id)
    .single();

  const { data: periodSlots } = await supabase
    .from("period_slots")
    .select("*")
    .order("period_number", { ascending: true });

  const { data: entries } = await supabase
    .from("timetable_entries")
    .select("day_of_week, period_slot_id, is_practical, subjects(name), sections(name, classes(name))")
    .eq("teacher_id", current!.user.id);

  const cells: TimetableCellData[] = (entries ?? []).map((e) => {
    const section = e.sections as unknown as { name: string; classes: { name: string } | null } | null;
    return {
      day_of_week: e.day_of_week,
      period_slot_id: e.period_slot_id,
      subject_name: (e.subjects as unknown as { name: string } | null)?.name ?? null,
      sub_label: section ? `${section.classes?.name ?? ""} ${section.name}`.trim() : null,
      is_practical: e.is_practical,
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">
        Welcome, {teacher?.name ?? "Teacher"}
      </h1>
      <p className="mt-1 text-sm text-brand-neutral">Your weekly timetable</p>

      <div className="mt-6">
        <TimetableTable periodSlots={periodSlots ?? []} cells={cells} />
      </div>
    </div>
  );
}
