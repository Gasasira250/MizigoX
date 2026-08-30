export function LaterPhasePage({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{phase}</p>
      <h1 className="mt-2 text-2xl font-semibold text-[#12355b]">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
    </section>
  );
}
