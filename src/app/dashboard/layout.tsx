import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-role";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between bg-brand-primary px-6 py-3">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Loyola School crest" width={36} height={36} />
          <div>
            <p className="text-sm font-semibold text-white">Loyola School, Taldanga</p>
            <p className="text-xs text-white/70">Teacher Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard/settings" className="text-sm text-white/85 hover:text-white">
            Settings
          </Link>
          <div className="w-28">
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="p-8">{children}</main>
    </div>
  );
}
