import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/today";
import { LiveClock } from "@/components/live-clock";
import { StatCard } from "@/components/stat-card";
import { AbsenteesBox } from "./absentees-box";

export default async function AdminHomePage() {
  const supabase = await createClient();
  const today = todayISO();

  const [{ count: teacherCount }, { count: classCount }, { count: sectionCount }, { count: absentCount }] =
    await Promise.all([
      supabase.from("teachers").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("classes").select("*", { count: "exact", head: true }),
      supabase.from("sections").select("*", { count: "exact", head: true }),
      supabase.from("teacher_absences").select("*", { count: "exact", head: true }).eq("date", today),
    ]);

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand-primary">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-brand-neutral">
            Loyola School, Taldanga — Timetable &amp; Substitution Management
          </p>
        </div>
        <LiveClock />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Teachers" value={teacherCount ?? 0} />
        <StatCard label="Classes" value={classCount ?? 0} />
        <StatCard label="Sections" value={sectionCount ?? 0} />
        <StatCard label="Absent Today" value={absentCount ?? 0} />
      </div>

      <div className="mt-8">
        <AbsenteesBox />
      </div>
    </div>
  );
}
