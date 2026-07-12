import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">Not found</p>
      <h1 className="text-3xl font-semibold text-ink">This page is not available.</h1>
      <p className="max-w-xl text-sm leading-6 text-stone-600">
        The Phase B foundation includes only the approved application routes.
      </p>
      <Link className="inline-flex text-sm font-semibold text-signal hover:text-ink" href="/">
        Return home
      </Link>
    </div>
  );
}
