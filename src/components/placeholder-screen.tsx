import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";

type PlaceholderScreenProps = {
  title: string;
  eyebrow: string;
  description: string;
  intent: string;
};

export function PlaceholderScreen({ title, eyebrow, description, intent }: PlaceholderScreenProps) {
  return (
    <div className="space-y-8">
      <Link
        className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-ink"
        href="/"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Home
      </Link>

      <section className="max-w-3xl space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">{eyebrow}</p>
        <h1 className="text-3xl font-semibold text-ink sm:text-4xl">{title}</h1>
        <p className="text-base leading-7 text-stone-600">{description}</p>
      </section>

      <section className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#f4ede0] text-[#8a5a2b]">
            <Clock3 aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-ink">Foundation placeholder</h2>
            <p className="max-w-2xl text-sm leading-6 text-stone-600">{intent}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
