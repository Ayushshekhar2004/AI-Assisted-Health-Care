export {
  appointmentDetailIdSchema,
  parseAppointmentDetailId,
} from './validation';
export {
  DOCTOR_HANDOFF_SUMMARY_VERSION,
  doctorHandoffSummarySchema,
  doctorHandoffSourceTraceSchema,
  generateDoctorHandoff,
  legacyDoctorHandoffSummarySchema,
} from './handoff';
export type { DoctorHandoffSourceTrace, DoctorHandoffSummary } from './handoff';
export {
  consultationNoteInputSchema,
  consultationNoteSchema,
  parseFinalConsultationNote,
  telemedicineAdequacySchema,
} from './note';
export type { ConsultationNote, ConsultationNoteInput } from './note';
export {
  consultationOutcomeInputSchema,
  consultationOutcomeSchema,
  consultationOutcomeTypeSchema,
} from './outcome';
export type { ConsultationOutcome, ConsultationOutcomeInput } from './outcome';
export {
  followUpRecommendationInputSchema,
  followUpRecommendationSchema,
  followUpTimingSchema,
} from './follow-up';
export type { FollowUpRecommendation } from './follow-up';
export {
  CONSULTATION_AI_DRAFT_INSTRUCTIONS,
  CONSULTATION_AI_PROMPT_VERSION,
  consultationAIDraftInputSchema,
  consultationAIDraftOutputSchema,
  consultationAIDraftRequestSchema,
  generateConsultationAIDraft,
} from './ai-draft';
export {
  appointmentConsultationStartRequestSchema,
  appointmentConsultationStartResponseSchema,
  appointmentVideoTokenRequestSchema,
  appointmentVideoTokenResponseSchema,
  getAppointmentRoomName,
  isTrustedVideoTokenRequest,
} from './video';
