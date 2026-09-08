import { createClient } from "@/lib/supabase/server";
import { TeacherForm } from "./teacher-form";

export default async function TeachersPage() {
  const supabase = await createClient();
  const { data: teachers } = await supabase
    .from("teachers")
    .select("*")
    .order("name", { ascending: true });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Teachers</h1>
      <p className="mt-1 text-sm text-brand-neutral">
        Create a teacher&apos;s account. They&apos;ll receive an email invite to set their password.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <TeacherForm />
      </div>

      <div className="mt-8 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Group</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {teachers?.map((teacher) => (
              <tr key={teacher.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{teacher.name}</td>
                <td className="px-4 py-3">{teacher.email}</td>
                <td className="px-4 py-3">{teacher.phone ?? "—"}</td>
                <td className="px-4 py-3">{teacher.group}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      teacher.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {teacher.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
            {!teachers?.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No teachers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
