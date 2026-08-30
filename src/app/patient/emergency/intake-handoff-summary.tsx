import type { IntakeStructuredOutput } from '@/modules/intake/server';

function display(value: string | null): string {
  return value ?? 'Not provided';
}

function displayList(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : 'Not provided';
}

export function IntakeHandoffSummary({
  summary,
}: Readonly<{ summary: IntakeStructuredOutput | null }>) {
  return (
    <section
      aria-labelledby="handoff-summary-title"
      className="handoff-summary"
    >
      <h2 id="handoff-summary-title">Intake summary for in-person handoff</h2>
      <p>
        This summary contains patient-provided information collected by an AI
        intake assistant. It is unreviewed, may be incomplete or incorrect, and
        is not a diagnosis or prescription. Show it to the in-person care team
        if useful, but do not delay seeking help to complete it.
      </p>
      {summary ? (
        <dl>
          <dt>Main concern</dt>
          <dd>{display(summary.chief_complaint)}</dd>
          <dt>Onset</dt>
          <dd>{display(summary.onset)}</dd>
          <dt>Duration</dt>
          <dd>{display(summary.duration)}</dd>
          <dt>Severity</dt>
          <dd>{display(summary.severity)}</dd>
          <dt>Associated symptoms</dt>
          <dd>{displayList(summary.associated_symptoms)}</dd>
          <dt>Relevant history</dt>
          <dd>{displayList(summary.relevant_history)}</dd>
          <dt>Current medicines</dt>
          <dd>{displayList(summary.current_medicines)}</dd>
          <dt>Allergies</dt>
          <dd>{displayList(summary.allergies)}</dd>
          {summary.pregnancy_possibility.clinically_relevant ? (
            <>
              <dt>Pregnancy possibility</dt>
              <dd>
                {summary.pregnancy_possibility.response.replaceAll('_', ' ')}
              </dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p>
          No structured intake summary has been recorded yet. Do not delay
          seeking urgent help.
        </p>
      )}
    </section>
  );
}
