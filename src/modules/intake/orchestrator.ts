import {
  intakeStructuredOutputSchema,
  type IntakeStructuredOutput,
} from './structured-output';

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
  const structured = intakeStructuredOutputSchema.parse(
    await model.generate(input),
  );
  return {
    assistantText:
      structured.follow_up_question ?? 'Thank you. This intake is complete.',
    intakeComplete: structured.intake_complete,
    structured,
  };
}
