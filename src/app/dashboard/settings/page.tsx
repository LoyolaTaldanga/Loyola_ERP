import { getCurrentUser } from "@/lib/auth/get-role";
import { createClient } from "@/lib/supabase/server";
import { EmailForm } from "./email-form";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string }>;
}) {
  const { verified } = await searchParams;
  const current = await getCurrentUser();
  const supabase = await createClient();

  const { data: teacher } = await supabase
    .from("teachers")
    .select("name, username, real_email, real_email_verified")
    .eq("id", current!.user.id)
    .single();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Settings</h1>

      {verified === "1" && (
        <div className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          Email verified successfully.
        </div>
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-brand-primary">Account</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">Name</dt>
          <dd>{teacher?.name}</dd>
          <dt className="text-slate-500">User ID</dt>
          <dd className="font-mono">{teacher?.username}</dd>
        </dl>
      </div>

      <div className="mt-6">
        <EmailForm currentRealEmail={teacher?.real_email ?? null} verified={teacher?.real_email_verified ?? false} />
      </div>
    </div>
  );
}
