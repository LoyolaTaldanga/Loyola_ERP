import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TeacherForm } from "./teacher-form";
import { ResetPasswordButton } from "./reset-password-button";
import { GroupSelect } from "./group-select";

export default async function TeachersPage() {
  const supabase = await createClient();
  const { data: teachers } = await supabase
    .from("teachers")
    .select("*")
    .order("name", { ascending: true });

  const needsReviewCount = teachers?.filter((t) => t.group_needs_review).length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Teachers</h1>
      <p className="mt-1 text-sm text-brand-neutral">
        Create a teacher&apos;s account. They log in with the generated User ID and password below —
        no email required.
      </p>

      {needsReviewCount > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {needsReviewCount} teacher{needsReviewCount === 1 ? "" : "s"} highlighted below had an
          ambiguous junior/senior split when their group was auto-derived — please confirm or
          correct it.
        </div>
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <TeacherForm />
      </div>

      <div className="mt-8 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">User ID</th>
              <th className="px-4 py-3 font-medium">Real email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Group</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {teachers?.map((teacher) => (
              <tr
                key={teacher.id}
                className={`border-t border-slate-100 ${teacher.group_needs_review ? "bg-amber-50" : ""}`}
              >
                <td className="px-4 py-3">
                  <Link href={`/admin/teachers/${teacher.id}`} className="text-brand-primary hover:underline">
                    {teacher.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{teacher.username}</td>
                <td className="px-4 py-3">
                  {teacher.real_email ? (
                    <span className={teacher.real_email_verified ? "text-green-700" : "text-amber-600"}>
                      {teacher.real_email} {teacher.real_email_verified ? "(verified)" : "(pending)"}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">{teacher.phone ?? "—"}</td>
                <td className="px-4 py-3">
                  <GroupSelect
                    teacherId={teacher.id}
                    initialGroup={teacher.group}
                    needsReview={teacher.group_needs_review}
                  />
                </td>
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
                <td className="px-4 py-3">
                  <ResetPasswordButton teacherId={teacher.id} teacherName={teacher.name} />
                </td>
              </tr>
            ))}
            {!teachers?.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
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
