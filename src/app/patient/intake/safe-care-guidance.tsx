import type { SafeCareWhileWaiting } from '@/modules/triage/server';

export function SafeCareGuidance({
  guidance,
}: Readonly<{ guidance: SafeCareWhileWaiting }>) {
  return (
    <section aria-labelledby="safe-care-heading" className="safe-care-guidance">
      <h2 id="safe-care-heading">While you wait for the doctor</h2>
      {guidance.allowed_interim_actions.length > 0 ? (
        <>
          <h3>Temporary self-care steps</h3>
          <ul>
            {guidance.allowed_interim_actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </>
      ) : null}
      <h3>Things to avoid</h3>
      <ul>
        {guidance.prohibited_actions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
      <h3>Warning signs requiring urgent help</h3>
      <ul>
        {guidance.red_flags.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <p role={guidance.disposition === 'EMERGENCY' ? 'alert' : undefined}>
        {guidance.escalation_message}
      </p>
      <p>
        <strong>{guidance.disclaimer}</strong>
      </p>
    </section>
  );
}
