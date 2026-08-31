import type { ConsultationNote } from '@/modules/consultation';

export function ConsultationNoteView({
  note,
}: Readonly<{ note: ConsultationNote }>) {
  return (
    <details>
      <summary>View finalized consultation note</summary>
      <dl className="appointment-detail-grid">
        <div>
          <dt>Subjective history</dt>
          <dd>{note.subjectiveHistory}</dd>
        </div>
        <div>
          <dt>Examination limitations and observations</dt>
          <dd>{note.examinationObservations}</dd>
        </div>
        <div>
          <dt>Assessment</dt>
          <dd>{note.assessment}</dd>
        </div>
        <div>
          <dt>Plan</dt>
          <dd>{note.plan}</dd>
        </div>
        <div>
          <dt>Follow-up</dt>
          <dd>{note.followUp || 'None specified'}</dd>
        </div>
        <div>
          <dt>Telemedicine adequacy</dt>
          <dd>
            {note.telemedicineAdequacy === 'ADEQUATE'
              ? 'Adequate'
              : 'Requires in-person care'}
          </dd>
        </div>
      </dl>
      <p>This is the finalized note from your assigned doctor.</p>
      {note.finalizedAt ? (
        <p>Finalized at {new Date(note.finalizedAt).toLocaleString()}.</p>
      ) : null}
    </details>
  );
}
