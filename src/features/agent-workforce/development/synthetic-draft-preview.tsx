import React from "react";
/** Explicit isolated preview fixtures. Never read by operational preparation, qualification or providers. */
export function SyntheticDraftPreview() {
  const messages = [
    {
      subject: "A question about brand coverage",
      body: "Hi Alex,\n\nThis fictional example explores how a senior Search leader might review branded coverage decisions. If paid and organic visibility overlap, the useful question is what each adds—not whether either should disappear.\n\nWould comparing the decision process be useful?\n\nGil",
    },
    {
      subject: "Re: A question about brand coverage",
      body: "Hi Alex,\n\nAnother way to frame the discussion: what evidence would justify changing branded coverage, and what would need protecting? For this fictional account, competitive conditions and campaign measurements are still unknown.\n\nWould that be a useful starting point?\n\nGil",
    },
    {
      subject: "Re: A question about brand coverage",
      body: "Hi Alex,\n\nHow would your team distinguish incremental paid-brand conversions from traffic that might have arrived organically? This example raises a measurement question; it makes no claim about results or wasted spend.\n\nOpen to comparing how you would evaluate it?\n\nGil",
    },
    {
      subject: "Re: A question about brand coverage",
      body: "Hi Alex,\n\nI’ll leave it here. If reviewing brand-search coverage becomes useful, happy to pick up the conversation.\n\nGil",
    },
  ];
  return (
    <section className="space-y-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">Synthetic research-only draft preview</h1>
      <p>
        Fictional prospect: Alex Example at Fictional Example Retail. This is development test data,
        not a HubSpot record, AI research result or approved outreach. Eligibility remains HOLD. No
        sending, enrollment, approval or CRM actions are available.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {messages.map((m, i) => (
          <article key={i} className="min-w-0 rounded-xl border bg-white p-4">
            <h2 className="font-semibold">Email {i + 1} · Synthetic fixture</h2>
            <p className="mt-2">Subject: {m.subject}</p>
            <p className="mt-3 whitespace-pre-wrap">{m.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
