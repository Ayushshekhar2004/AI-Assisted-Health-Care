import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { ConsultationNote, ConsultationOutcome } from '../consultation';
import type { Prescription } from './validation';

export type FinalizedDocumentInput = Readonly<{
  appointmentId: string;
  consultation: ConsultationNote;
  prescription: Prescription | null;
  outcome: ConsultationOutcome | null;
}>;

function safeText(value: string) {
  return value.normalize('NFKD').replace(/[^\x20-\x7E\n]/g, '?');
}
function lines(text: string, font: PDFFont, size: number, maxWidth: number) {
  const result: string[] = [];
  for (const paragraph of safeText(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) result.push(line);
        line = word;
      }
    }
    result.push(line);
  }
  return result;
}

export async function createFinalizedConsultationPdf(
  input: FinalizedDocumentInput,
): Promise<Uint8Array> {
  if (
    input.consultation.status !== 'FINALIZED' ||
    (input.prescription && input.prescription.status !== 'FINAL')
  ) {
    throw new Error('Only finalized content can be rendered');
  }
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage();
  let y = page.getHeight() - 50;
  const margin = 50;
  const width = page.getWidth() - margin * 2;
  function write(text: string, heading = false) {
    const chosen = heading ? bold : font;
    const size = heading ? 14 : 10;
    for (const line of lines(text, chosen, size, width)) {
      if (y < 50) {
        page = pdf.addPage();
        y = page.getHeight() - 50;
      }
      page.drawText(line, {
        x: margin,
        y,
        size,
        font: chosen,
        color: rgb(0, 0, 0),
      });
      y -= size + 4;
    }
    y -= heading ? 6 : 3;
  }
  write('Finalized consultation document', true);
  write(`Appointment: ${input.appointmentId}`);
  write('Consultation note', true);
  write(`Subjective history: ${input.consultation.subjectiveHistory}`);
  write(
    `Examination limitations/observations: ${input.consultation.examinationObservations}`,
  );
  write(`Assessment: ${input.consultation.assessment}`);
  write(`Plan: ${input.consultation.plan}`);
  write(`Follow-up: ${input.consultation.followUp || 'None specified'}`);
  if (input.outcome) {
    write('Consultation outcome', true);
    write(input.outcome.outcome.replaceAll('_', ' '));
    if (input.outcome.referralSpecialty)
      write(`Referral specialty: ${input.outcome.referralSpecialty}`);
    if (input.outcome.clinicLocation)
      write(`Clinic/location: ${input.outcome.clinicLocation}`);
    if (input.outcome.locationInstructions)
      write(`Location instructions: ${input.outcome.locationInstructions}`);
    if (input.outcome.appointmentNote)
      write(`Appointment note: ${input.outcome.appointmentNote}`);
  }
  if (input.prescription) {
    write('Prescription', true);
    write(`Doctor: ${input.prescription.doctorName}`);
    write(
      `Registration: ${input.prescription.registrationNumber}, ${input.prescription.registrationCouncil}, ${input.prescription.registrationState}`,
    );
    write(`Date: ${input.prescription.prescriptionDate}`);
    input.prescription.items.forEach((item, index) =>
      write(
        `${index + 1}. ${item.itemType}: ${item.itemName}; dosage: ${item.dosage || '-'}; frequency: ${item.frequency || '-'}; duration: ${item.duration || '-'}; instructions: ${item.instructions || '-'}`,
      ),
    );
    write(
      `Prescription follow-up: ${input.prescription.followUp || 'None specified'}`,
    );
  } else
    write('No finalized prescription is associated with this consultation.');
  write(
    'This document contains clinician-finalized records. Seek urgent or emergency care when appropriate; this document does not rule out an emergency.',
  );
  return pdf.save();
}
