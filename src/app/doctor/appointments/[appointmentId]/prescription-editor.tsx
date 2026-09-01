'use client';

import { useActionState, useState } from 'react';
import type {
  Prescription,
  PrescriptionItemInput,
} from '@/modules/prescription';
import {
  finalizePrescriptionAction,
  savePrescriptionDraftAction,
  type PrescriptionActionState,
} from './prescription-actions';

const initialState: PrescriptionActionState = { status: 'idle', message: '' };
const emptyItem: PrescriptionItemInput = {
  itemType: 'MEDICINE',
  itemName: '',
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
};

export function PrescriptionEditor({
  appointmentId,
  prescription,
}: Readonly<{
  appointmentId: string;
  prescription: Prescription | null;
}>) {
  const [items, setItems] = useState<PrescriptionItemInput[]>(
    prescription?.items.map(
      ({ itemType, itemName, dosage, frequency, duration, instructions }) => ({
        itemType,
        itemName,
        dosage,
        frequency,
        duration,
        instructions,
      }),
    ) ?? [],
  );
  const [draftState, saveDraft, draftPending] = useActionState(
    savePrescriptionDraftAction,
    initialState,
  );
  const [finalState, finalize, finalPending] = useActionState(
    finalizePrescriptionAction,
    initialState,
  );
  const final = prescription?.status === 'FINAL';
  const state = finalState.status !== 'idle' ? finalState : draftState;

  function update(index: number, patch: Partial<PrescriptionItemInput>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  return (
    <section aria-labelledby="prescription-editor">
      <h2 id="prescription-editor">Prescription</h2>
      <p>
        Only the assigned doctor can finalize this prescription. AI cannot
        finalize or submit it.
      </p>
      {prescription ? (
        <p>
          Doctor: {prescription.doctorName} — Registration{' '}
          {prescription.registrationNumber}, {prescription.registrationCouncil},{' '}
          {prescription.registrationState}
        </p>
      ) : null}
      <form action={saveDraft} className="prescription-editor-form">
        <input name="appointmentId" type="hidden" value={appointmentId} />
        <input name="items" type="hidden" value={JSON.stringify(items)} />
        {items.map((item, index) => (
          <fieldset key={index}>
            <legend>Entry {index + 1}</legend>
            <label>
              Entry type
              <select
                disabled={final}
                value={item.itemType}
                onChange={(event) =>
                  update(index, {
                    itemType: event.target
                      .value as PrescriptionItemInput['itemType'],
                  })
                }
              >
                <option value="MEDICINE">Medicine</option>
                <option value="TEST">Test</option>
                <option value="INSTRUCTION">Instruction</option>
              </select>
            </label>
            <label>
              Name or instruction
              <input
                disabled={final}
                maxLength={500}
                required
                value={item.itemName}
                onChange={(event) =>
                  update(index, { itemName: event.target.value })
                }
              />
            </label>
            <label>
              Dosage
              <input
                disabled={final}
                maxLength={200}
                value={item.dosage}
                onChange={(event) =>
                  update(index, { dosage: event.target.value })
                }
              />
            </label>
            <label>
              Frequency
              <input
                disabled={final}
                maxLength={200}
                value={item.frequency}
                onChange={(event) =>
                  update(index, { frequency: event.target.value })
                }
              />
            </label>
            <label>
              Duration
              <input
                disabled={final}
                maxLength={200}
                value={item.duration}
                onChange={(event) =>
                  update(index, { duration: event.target.value })
                }
              />
            </label>
            <label>
              Instructions
              <textarea
                disabled={final}
                maxLength={1000}
                value={item.instructions}
                onChange={(event) =>
                  update(index, { instructions: event.target.value })
                }
              />
            </label>
            {!final ? (
              <button
                type="button"
                onClick={() =>
                  setItems((current) => current.filter((_, i) => i !== index))
                }
              >
                Remove entry {index + 1}
              </button>
            ) : null}
          </fieldset>
        ))}
        <label>
          Follow-up
          <textarea
            defaultValue={prescription?.followUp ?? ''}
            disabled={final}
            maxLength={4000}
            name="followUp"
          />
        </label>
        {!final ? (
          <div className="form-actions">
            <button
              type="button"
              disabled={items.length >= 50}
              onClick={() =>
                setItems((current) => [...current, { ...emptyItem }])
              }
            >
              Add entry
            </button>
            <button disabled={draftPending || finalPending} type="submit">
              Save prescription draft
            </button>
            <button
              disabled={draftPending || finalPending || items.length === 0}
              formAction={finalize}
              type="submit"
            >
              Review and finalize prescription
            </button>
          </div>
        ) : (
          <p>This prescription is final and cannot be edited.</p>
        )}
        {state.message ? (
          <p aria-live="polite" role="status">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
