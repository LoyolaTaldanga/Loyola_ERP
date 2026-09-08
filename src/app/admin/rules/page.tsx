import { createClient } from "@/lib/supabase/server";
import { RuleRow } from "./rule-row";

export default async function RulesPage() {
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("substitution_rules")
    .select("*")
    .order("priority_order", { ascending: true });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-primary">Substitution Rules</h1>
      <p className="mt-1 text-sm text-brand-neutral">
        Priority order controls evaluation order for the ranking rules (lower number = evaluated
        first). Changes apply to the next absence marked — nothing here is cached.
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Rule</th>
              <th className="px-4 py-3 font-medium">Priority order</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Config</th>
            </tr>
          </thead>
          <tbody>
            {rules?.map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
