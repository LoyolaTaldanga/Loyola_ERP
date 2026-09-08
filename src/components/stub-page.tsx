export function StubPage({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">{title}</h1>
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
        Coming in a later phase.
      </div>
    </div>
  );
}
