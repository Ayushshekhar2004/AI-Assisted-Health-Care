import {
  intakeFieldSchema,
  intakeStructuredOutputSchema,
  type IntakeStructuredOutput,
} from './structured-output';

const MAX_PATIENT_TURNS = 8;

const fallbackQuestions: Record<
  (typeof intakeFieldSchema.options)[number],
  string
> = {
  chief_complaint: 'What is the main health concern you want help with?',
  onset: 'When did this concern begin?',
  duration: 'How long has this concern been present?',
  severity: 'How severe is it right now?',
  associated_symptoms: 'Are there any other symptoms occurring with it?',
  relevant_history: 'Is there any relevant medical history to share?',
  current_medicines: 'Are you currently taking any medicines?',
  allergies: 'Do you have any known allergies?',
  pregnancy_possibility: 'Could pregnancy currently be possible?',
};

const fallbackQuestionsHindi: typeof fallbackQuestions = {
  chief_complaint: 'आपकी मुख्य स्वास्थ्य समस्या क्या है?',
  onset: 'यह समस्या कब शुरू हुई?',
  duration: 'यह समस्या कितने समय से है?',
  severity: 'अभी इसकी गंभीरता कितनी है?',
  associated_symptoms: 'क्या इसके साथ कोई और लक्षण भी हैं?',
  relevant_history: 'क्या कोई संबंधित चिकित्सा इतिहास साझा करना है?',
  current_medicines: 'क्या आप अभी कोई दवा ले रहे हैं?',
  allergies: 'क्या आपको कोई ज्ञात एलर्जी है?',
  pregnancy_possibility: 'क्या इस समय गर्भावस्था संभव हो सकती है?',
};

export type IntakeConversationMessage = Readonly<{
  role: 'patient' | 'assistant';
  text: string;
}>;

export type IntakeModelInput = Readonly<{
  messages: IntakeConversationMessage[];
  previousStructured: IntakeStructuredOutput | null;
}>;

export interface IntakeModel {
  generate(input: IntakeModelInput): Promise<unknown>;
}

export type IntakeOrchestratorResult = Readonly<{
  assistantText: string;
  intakeComplete: boolean;
  structured: IntakeStructuredOutput;
}>;

export async function orchestrateIntake(
  model: IntakeModel,
  input: IntakeModelInput,
): Promise<IntakeOrchestratorResult> {
  const generated = intakeStructuredOutputSchema.parse(
    await model.generate(input),
  );
  const structured = preserveIntakeProgress(
    input.previousStructured,
    generated,
  );
  const previousAssistantQuestions = input.messages
    .filter(
      (message) => message.role === 'assistant' && message.text.endsWith('?'),
    )
    .map((message) => message.text);
  const patientTurnCount = input.messages.filter(
    (message) => message.role === 'patient',
  ).length;
  const fallbackQuestionSet = input.messages.some((message) =>
    /\p{Script=Devanagari}/u.test(message.text),
  )
    ? fallbackQuestionsHindi
    : fallbackQuestions;

  if (patientTurnCount >= MAX_PATIENT_TURNS) return completeIntake(structured);

  if (
    structured.follow_up_question &&
    previousAssistantQuestions.some((question) =>
      questionsAreSimilar(question, structured.follow_up_question!),
    )
  ) {
    const fallback = structured.missing_information
      .map((field) => fallbackQuestionSet[field])
      .find(
        (question) =>
          !previousAssistantQuestions.some((previous) =>
            questionsAreSimilar(previous, question),
          ),
      );

    if (!fallback) return completeIntake(structured);

    const guarded = intakeStructuredOutputSchema.parse({
      ...structured,
      follow_up_question: fallback,
      intake_complete: false,
    });
    return {
      assistantText: fallback,
      intakeComplete: false,
      structured: guarded,
    };
  }

  return {
    assistantText:
      structured.follow_up_question ?? 'Thank you. This intake is complete.',
    intakeComplete: structured.intake_complete,
    structured,
  };
}

function preserveIntakeProgress(
  previous: IntakeStructuredOutput | null,
  generated: IntakeStructuredOutput,
): IntakeStructuredOutput {
  if (!previous) return generated;

  const previouslyMissing = new Set(previous.missing_information);
  if (
    !previous.pregnancy_possibility.clinically_relevant &&
    generated.pregnancy_possibility.clinically_relevant
  ) {
    previouslyMissing.add('pregnancy_possibility');
  }
  const missingInformation = generated.missing_information.filter((field) =>
    previouslyMissing.has(field),
  );

  return intakeStructuredOutputSchema.parse({
    ...generated,
    chief_complaint: generated.chief_complaint ?? previous.chief_complaint,
    onset: generated.onset ?? previous.onset,
    duration: generated.duration ?? previous.duration,
    severity: generated.severity ?? previous.severity,
    associated_symptoms: mergeLists(
      previous.associated_symptoms,
      generated.associated_symptoms,
    ),
    relevant_history: mergeLists(
      previous.relevant_history,
      generated.relevant_history,
    ),
    current_medicines: mergeLists(
      previous.current_medicines,
      generated.current_medicines,
    ),
    allergies: mergeLists(previous.allergies, generated.allergies),
    pregnancy_possibility:
      generated.pregnancy_possibility.clinically_relevant &&
      !previous.pregnancy_possibility.clinically_relevant
        ? generated.pregnancy_possibility
        : previous.pregnancy_possibility.response !== 'not_asked'
          ? previous.pregnancy_possibility
          : generated.pregnancy_possibility,
    missing_information: missingInformation,
    follow_up_question:
      missingInformation.length === 0 ? null : generated.follow_up_question,
    intake_complete:
      missingInformation.length === 0 ? true : generated.intake_complete,
  });
}

function mergeLists(previous: string[], generated: string[]): string[] {
  return [...new Set([...previous, ...generated])].slice(0, 20);
}

function completeIntake(
  structured: IntakeStructuredOutput,
): IntakeOrchestratorResult {
  const completed = intakeStructuredOutputSchema.parse({
    ...structured,
    follow_up_question: null,
    intake_complete: true,
  });
  return {
    assistantText:
      'Thank you. This intake is complete. Any unanswered items have been noted for the doctor.',
    intakeComplete: true,
    structured: completed,
  };
}

function questionsAreSimilar(left: string, right: string): boolean {
  const leftWords = normalizedWords(left);
  const rightWords = normalizedWords(right);
  if (leftWords.size === 0 || rightWords.size === 0) return false;
  const intersection = [...leftWords].filter((word) => rightWords.has(word));
  const union = new Set([...leftWords, ...rightWords]);
  return intersection.length / union.size >= 0.7;
}

function normalizedWords(question: string): Set<string> {
  return new Set(
    question
      .toLocaleLowerCase('en-US')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 0),
  );
}
