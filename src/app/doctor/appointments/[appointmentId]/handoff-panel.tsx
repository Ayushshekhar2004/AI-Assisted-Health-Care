'use client';

import { useActionState } from 'react';

import type { DoctorHandoffSourceTrace } from '@/modules/consultation';
import type { StoredDoctorHandoff } from '@/modules/consultation/server';

import { LocalDateTime } from '../../../_components/local-date-time';
import {
  generateDoctorHandoffAction,
  type HandoffActionState,
  type HandoffFeedbackActionState,
  markHandoffItemInaccurateAction,
} from './handoff-actions';

const sourceKindLabels = {
  STRUCTURED_INTAKE: 'Structured intake field',
  EXPLICIT_SCREENING_ANSWER: 'Explicit patient screening answer',
  DETERMINISTIC_TRIAGE: 'Deterministic red-flag result',
  SPECIALTY_ROUTING: 'Non-diagnostic routing result',
} as const;

function MarkInaccurateButton({
  appointmentId,
  initiallyMarked,
  itemKey,
  summaryVersion,
}: Readonly<{
  appointmentId: string;
  initiallyMarked: boolean;
  itemKey: string;
  summaryVersion: StoredDoctorHandoff['summaryVersion'];
}>) {
  const initialState: HandoffFeedbackActionState = {
    status: initiallyMarked ? 'success' : 'idle',
    message: initiallyMarked
      ? 'Previously marked inaccurate. The original is unchanged.'
      : '',
  };
  const [state, formAction, pending] = useActionState(
    markHandoffItemInaccurateAction,
    initialState,
  );
  const marked = state.status === 'success';

  return (
    <div>
      <form action={formAction}>
        <input name="appointmentId" type="hidden" value={appointmentId} />
        <input name="summaryVersion" type="hidden" value={summaryVersion} />
        <input name="itemKey" type="hidden" value={itemKey} />
        <button disabled={pending || marked} type="submit">
          {marked
            ? 'Marked inaccurate'
            : pending
              ? 'Recording feedback…'
              : 'Mark inaccurate'}
        </button>
      </form>
      {state.message ? (
        <small aria-live="polite" role="status">
          {state.message}
        </small>
      ) : null}
    </div>
  );
}

function TraceableValue({
  appointmentId,
  children,
  inaccurateItemKeys,
  itemKey,
  summaryVersion,
  trace,
}: Readonly<{
  appointmentId: string;
  children: React.ReactNode;
  inaccurateItemKeys: readonly string[];
  itemKey: string;
  summaryVersion: StoredDoctorHandoff['summaryVersion'];
  trace: DoctorHandoffSourceTrace | undefined;
}>) {
  return (
    <div className="handoff-traceable-item">
      <div>{children}</div>
      <details>
        <summary>View source</summary>
        {trace ? (
          <>
            <p>{sourceKindLabels[trace.source_kind]}</p>
            <p>
              Field: <code>{trace.source_field}</code>
            </p>
            {trace.recorded_answer ? (
              <p>Recorded answer: {trace.recorded_answer}</p>
            ) : null}
            <MarkInaccurateButton
              appointmentId={appointmentId}
              initiallyMarked={inaccurateItemKeys.includes(itemKey)}
              itemKey={itemKey}
              summaryVersion={summaryVersion}
            />
          </>
        ) : (
          <p>Source trace is unavailable for this legacy summary.</p>
        )}
      </details>
    </div>
  );
}

function TraceableList({
  appointmentId,
  inaccurateItemKeys,
  itemPrefix,
  summaryVersion,
  traces,
  values,
}: Readonly<{
  appointmentId: string;
  inaccurateItemKeys: readonly string[];
  itemPrefix: string;
  summaryVersion: StoredDoctorHandoff['summaryVersion'];
  traces: readonly DoctorHandoffSourceTrace[];
  values: readonly string[];
}>) {
  return values.length ? (
    <ul>
      {values.map((value, index) => {
        const itemKey = `${itemPrefix}.${index}`;
        return (
          <li key={itemKey}>
            <TraceableValue
              appointmentId={appointmentId}
              inaccurateItemKeys={inaccurateItemKeys}
              itemKey={itemKey}
              summaryVersion={summaryVersion}
              trace={traces.find((item) => item.item_key === itemKey)}
            >
              {value}
            </TraceableValue>
          </li>
        );
      })}
    </ul>
  ) : (
    <p>None recorded.</p>
  );
}

export function HandoffSummary({
  appointmentId,
  handoff,
  inaccurateItemKeys = [],
}: Readonly<{
  appointmentId: string;
  handoff: StoredDoctorHandoff;
  inaccurateItemKeys?: readonly string[];
}>) {
  const { summary } = handoff;
  const redFlag = summary.red_flag_status;
  const traces = 'source_trace' in summary ? summary.source_trace : [];
  const traceFor = (itemKey: string) =>
    traces.find((trace) => trace.item_key === itemKey);
  const traceable = (itemKey: string, value: React.ReactNode) => (
    <TraceableValue
      appointmentId={appointmentId}
      inaccurateItemKeys={inaccurateItemKeys}
      itemKey={itemKey}
      summaryVersion={handoff.summaryVersion}
      trace={traceFor(itemKey)}
    >
      {value}
    </TraceableValue>
  );

  return (
    <div>
      <p className="ai-unverified-notice" role="note">
        Generated from AI-structured intake and deterministic safety checks —
        unverified until reviewed by the doctor. This is not a diagnosis or
        prescription.
      </p>
      <p>
        Summary version: {handoff.summaryVersion} · Generated{' '}
        <LocalDateTime startsAt={handoff.generatedAt} />
      </p>
      <p>
        Marking an item inaccurate records feedback for evaluation and never
        rewrites the original summary or its safety status.
      </p>
      <dl className="appointment-detail-grid">
        <div>
          <dt>Chief complaint</dt>
          <dd>
            {traceable(
              'chief_complaint',
              summary.chief_complaint ?? 'Not provided',
            )}
          </dd>
        </div>
        <div>
          <dt>Timeline</dt>
          <dd>
            {traceable(
              'timeline.onset',
              <>Onset: {summary.timeline.onset ?? 'Not provided'}</>,
            )}
            {traceable(
              'timeline.duration',
              <>Duration: {summary.timeline.duration ?? 'Not provided'}</>,
            )}
          </dd>
        </div>
        {[
          ['Positives', 'positives', summary.positives],
          [
            'Important negatives explicitly asked',
            'important_negatives',
            summary.important_negatives.map((item) => item.statement),
          ],
          ['Relevant history', 'relevant_history', summary.relevant_history],
          ['Medications', 'medications', summary.medications],
          ['Allergies', 'allergies', summary.allergies],
          [
            'Unanswered questions',
            'unanswered_questions',
            summary.unanswered_questions,
          ],
        ].map(([label, prefix, values]) => (
          <div key={label as string}>
            <dt>{label}</dt>
            <dd>
              <TraceableList
                appointmentId={appointmentId}
                inaccurateItemKeys={inaccurateItemKeys}
                itemPrefix={prefix as string}
                summaryVersion={handoff.summaryVersion}
                traces={traces}
                values={values as string[]}
              />
            </dd>
          </div>
        ))}
        <div>
          <dt>Routing reason</dt>
          <dd>
            {traceable(
              'routing_reason',
              summary.routing_reason ?? 'Not recorded',
            )}
          </dd>
        </div>
        <div>
          <dt>Patient quotes</dt>
          <dd>
            {summary.patient_quotes.length ? (
              <TraceableList
                appointmentId={appointmentId}
                inaccurateItemKeys={inaccurateItemKeys}
                itemPrefix="patient_quotes"
                summaryVersion={handoff.summaryVersion}
                traces={traces}
                values={summary.patient_quotes}
              />
            ) : (
              <p>No quote was necessary from the verified source data.</p>
            )}
          </dd>
        </div>
      </dl>
      <div
        className={
          redFlag.outcome === 'RED_FLAG' ? 'emergency-guidance' : undefined
        }
        role={redFlag.outcome === 'RED_FLAG' ? 'alert' : undefined}
      >
        <h3>Red-flag status</h3>
        {traceable(
          'red_flag_status',
          <>
            <p>Outcome: {redFlag.outcome.replaceAll('_', ' ')}</p>
            <p>
              Rule-set version: {redFlag.rule_set_version ?? 'Not recorded'}
            </p>
            {redFlag.matched_rule_codes.length ? (
              <ul>
                {redFlag.matched_rule_codes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            ) : (
              <p>No configured rule matched.</p>
            )}
          </>,
        )}
        <p>A recorded check cannot rule out an emergency.</p>
      </div>
    </div>
  );
}

export function HandoffPanel({
  appointmentId,
  initialHandoff,
  initialInaccurateItemKeys = [],
}: Readonly<{
  appointmentId: string;
  initialHandoff: StoredDoctorHandoff | null;
  initialInaccurateItemKeys?: readonly string[];
}>) {
  const initialState: HandoffActionState = {
    status: initialHandoff ? 'success' : 'idle',
    message: '',
    handoff: initialHandoff,
  };
  const [state, formAction, pending] = useActionState(
    generateDoctorHandoffAction,
    initialState,
  );

  return (
    <section aria-labelledby="doctor-handoff">
      <h2 id="doctor-handoff">Doctor handoff</h2>
      {state.handoff ? (
        <HandoffSummary
          appointmentId={appointmentId}
          handoff={state.handoff}
          inaccurateItemKeys={initialInaccurateItemKeys}
        />
      ) : (
        <>
          <p>
            Generate a versioned handoff from structured intake and explicit
            safety-screening answers. Transcript content is not used.
          </p>
          <form action={formAction}>
            <input name="appointmentId" type="hidden" value={appointmentId} />
            <button disabled={pending} type="submit">
              {pending ? 'Generating handoff…' : 'Generate handoff'}
            </button>
          </form>
        </>
      )}
      {state.status === 'error' ? (
        <p aria-live="polite" className="auth-message" role="status">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
