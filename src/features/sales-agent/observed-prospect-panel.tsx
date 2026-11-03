import React from "react";
import { observedProspectDecision, type ObservedProspect } from "./observed-prospect-review";

export function ObservedProspectPanel({ packet }: { packet: ObservedProspect }) {
  const decision = observedProspectDecision(packet);
  return (
    <section className="space-y-4 rounded border p-5">
      <h2 className="text-xl font-semibold">Real prospect review — {decision.status}</h2>
      <p>
        <a className="underline" href={packet.contact.url}>
          {packet.contact.name}
        </a>
        {" — "}
        {packet.contact.title}, {packet.contact.company}
      </p>
      <p>
        Read-only snapshot: {packet.observedAt}. These are observed records and public context, not
        independently accepted research findings. No CRM records changed.
      </p>
      <h3 className="font-semibold">Evidence and limitations</h3>
      <dl className="space-y-3">
        {packet.observations.map((item) => (
          <div key={item.label}>
            <dt>
              <strong>{item.label}</strong>
            </dt>
            <dd>
              {item.value}{" "}
              <a className="underline" href={item.url}>
                Source
              </a>
            </dd>
            <dd>{item.limitation}</dd>
          </div>
        ))}
      </dl>
      <h3 className="font-semibold">Public company context — Grounding not run</h3>
      {packet.context.map((item) => (
        <article key={item.url}>
          <p>{item.statement}</p>
          <blockquote>“{item.quote}”</blockquote>
          <a className="underline" href={item.url}>
            Public source
          </a>
          <p>{item.limitation}</p>
        </article>
      ))}
      <h3 className="font-semibold">Opportunity hypothesis — not proven savings</h3>
      <p>{packet.hypothesis}</p>
      <h3 className="font-semibold">Eligibility blockers from the existing gate</h3>
      <ul>
        {decision.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <h3 className="font-semibold">Next evidence actions</h3>
      <ol>
        {packet.nextActions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ol>
      <p>
        <strong>No real-contact drafts.</strong> Independent semantic Judgement: NOT RUN. Factual
        acceptance and Signal opportunity quality are unassessed. Sending and enrollment remain
        blocked. The fictional examples below do not qualify this person.
      </p>
    </section>
  );
}
