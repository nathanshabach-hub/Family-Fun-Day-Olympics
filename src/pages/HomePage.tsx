export function HomePage() {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-2xl font-bold text-brand-navy">Stage 1 Scaffold Ready</h2>
      <p className="mt-3 text-slate-700">
        Frontend routing, Tailwind styling, and the Cloudflare Worker API shell are wired up.
      </p>
      <p className="mt-2 text-slate-700">
        Next stage will add D1 migrations and the full schema implementation.
      </p>
    </section>
  );
}
