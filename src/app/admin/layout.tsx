import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-role";
import { AdminNav } from "@/components/admin-nav";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 flex-shrink-0 flex-col gap-6 bg-brand-primary p-5">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Loyola School crest" width={40} height={40} />
          <div>
            <p className="text-sm font-semibold text-white">Loyola Taldanga</p>
            <p className="text-xs text-white/70">Admin console</p>
          </div>
        </div>
        <AdminNav />
        <div className="mt-auto">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
