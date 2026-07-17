export default function Loading() {
  return (
    <main className="space-y-6">
      <section className="animate-pulse rounded-2xl border border-line bg-gradient-to-br from-lime/70 to-[#d7df91] p-6 shadow-signal">
        <div className="h-3 w-32 rounded-full bg-olive/25" />
        <div className="mt-5 h-9 w-3/4 rounded-full bg-ink/15" />
        <div className="mt-3 h-9 w-1/2 rounded-full bg-ink/15" />
        <div className="mt-6 h-4 w-2/3 rounded-full bg-white/45" />
        <div className="mt-3 h-4 w-1/2 rounded-full bg-white/45" />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="animate-pulse rounded-2xl border border-line bg-cream p-5">
          <div className="h-5 w-40 rounded-full bg-line" />
          <div className="mt-5 space-y-3">
            <div className="h-10 rounded-xl bg-white" />
            <div className="h-10 rounded-xl bg-white" />
            <div className="h-10 rounded-xl bg-white" />
          </div>
        </div>
        <div className="animate-pulse rounded-2xl border border-line bg-white p-5">
          <div className="h-5 w-44 rounded-full bg-line" />
          <div className="mt-5 h-28 rounded-xl bg-cream" />
        </div>
      </section>
    </main>
  );
}
