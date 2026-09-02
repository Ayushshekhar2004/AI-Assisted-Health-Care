import { z } from 'zod';

import { withAISecurityInstructions } from '../../lib/ai/prompt-security';
import { isAIFailure, runAIWorkflow } from '../../lib/ai/failure';

import { intakeStructuredOutputSchema } from '../intake';

export const SAFE_CARE_LIBRARY_VERSION = 'safe-care-development-v1';
export const SAFE_CARE_PROMPT_VERSION = 'safe-care-classification-v1';

export const safeCareCategorySchema = z.enum([
  'MILD_HEADACHE',
  'MILD_FEVER',
  'MINOR_SPRAIN_STRAIN',
  'MILD_ACIDITY_INDIGESTION',
  'MINOR_SUPERFICIAL_CUT',
  'MILD_ANXIETY_PANIC',
  'UNSUPPORTED',
]);

export const safeCareClassificationSchema = z
  .object({ symptom_category: safeCareCategorySchema })
  .strict();

export const safeCareGuidanceSchema = z
  .object({
    symptom_category: safeCareCategorySchema,
    allowed_interim_actions: z.array(z.string().min(1).max(300)).max(8),
    red_flags: z.array(z.string().min(1).max(300)).min(1).max(10),
    prohibited_actions: z.array(z.string().min(1).max(300)).min(1).max(8),
    escalation_message: z.string().min(1).max(500),
    disclaimer: z.string().min(1).max(500),
    language: z.enum(['en', 'hi']),
    disposition: z.enum(['GUIDANCE', 'UNSUPPORTED', 'HIGH_RISK', 'EMERGENCY']),
    library_version: z.literal(SAFE_CARE_LIBRARY_VERSION),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.disposition !== 'GUIDANCE' &&
      value.allowed_interim_actions.length > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Suppressed guidance cannot contain interim actions',
      });
    }
  });

export type SafeCareCategory = z.infer<typeof safeCareCategorySchema>;
export type SafeCareGuidance = z.infer<typeof safeCareGuidanceSchema>;

export function isSafeCarePreResponseStatus(
  appointmentStatus: string | null,
): boolean {
  return (
    appointmentStatus === null ||
    appointmentStatus === 'REQUESTED' ||
    appointmentStatus === 'CONFIRMED'
  );
}

type LocalizedGuidance = Readonly<{
  allowed_interim_actions: readonly string[];
  red_flags: readonly string[];
  prohibited_actions: readonly string[];
  escalation_message: string;
  disclaimer: string;
}>;

type GuidanceEntry = Readonly<Record<'en' | 'hi', LocalizedGuidance>>;

const disclaimer = {
  en: 'This is temporary, general guidance while you wait. It is not a diagnosis or prescription and does not replace a doctor.',
  hi: 'यह डॉक्टर की प्रतीक्षा के दौरान केवल अस्थायी, सामान्य मार्गदर्शन है। यह निदान या पर्चा नहीं है और डॉक्टर की जगह नहीं लेता।',
} as const;

export const SAFE_CARE_GUIDANCE_LIBRARY: Readonly<
  Record<Exclude<SafeCareCategory, 'UNSUPPORTED'>, GuidanceEntry>
> = {
  MILD_HEADACHE: {
    en: {
      allowed_interim_actions: [
        'Rest in a quiet place.',
        'Drink water normally and avoid dehydration.',
        'Reduce bright light and screen exposure if they worsen discomfort.',
      ],
      prohibited_actions: [
        'Do not start a new medicine or exceed any medicine already directed by a clinician.',
        'Do not drive if you feel dizzy, confused, or your vision is affected.',
      ],
      red_flags: [
        'A sudden extremely severe headache',
        'New weakness, trouble speaking, confusion, fainting, or vision loss',
        'Repeated vomiting, stiff neck, seizure, or headache after significant injury',
      ],
      escalation_message:
        'Seek urgent in-person medical help if any warning sign appears or symptoms become severe.',
      disclaimer: disclaimer.en,
    },
    hi: {
      allowed_interim_actions: [
        'शांत जगह पर आराम करें।',
        'सामान्य रूप से पानी पिएँ और शरीर में पानी की कमी न होने दें।',
        'तेज़ रोशनी या स्क्रीन से परेशानी बढ़े तो उनका उपयोग कम करें।',
      ],
      prohibited_actions: [
        'कोई नई दवा शुरू न करें और डॉक्टर द्वारा बताई दवा की मात्रा से अधिक न लें।',
        'चक्कर, भ्रम या दृष्टि में परेशानी हो तो वाहन न चलाएँ।',
      ],
      red_flags: [
        'अचानक अत्यंत तेज़ सिरदर्द',
        'नई कमजोरी, बोलने में दिक्कत, भ्रम, बेहोशी या दृष्टि जाना',
        'बार-बार उल्टी, गर्दन अकड़ना, दौरा या गंभीर चोट के बाद सिरदर्द',
      ],
      escalation_message:
        'कोई चेतावनी संकेत आए या लक्षण गंभीर हों तो तुरंत प्रत्यक्ष चिकित्सा सहायता लें।',
      disclaimer: disclaimer.hi,
    },
  },
  MILD_FEVER: {
    en: {
      allowed_interim_actions: [
        'Rest and drink fluids normally.',
        'Wear comfortable light clothing and keep the room comfortably ventilated.',
        'Check whether symptoms are worsening while you wait.',
      ],
      prohibited_actions: [
        'Do not start antibiotics or prescription medicines without a clinician.',
        'Do not use ice baths or extreme cooling.',
      ],
      red_flags: [
        'Difficulty breathing, severe drowsiness, confusion, fainting, or seizure',
        'Inability to drink, very little urine, or other signs of significant dehydration',
        'Rapid worsening or a fever in a very young child, frail older adult, or pregnant person',
      ],
      escalation_message:
        'Seek urgent in-person medical help if any warning sign appears or the person is becoming more unwell.',
      disclaimer: disclaimer.en,
    },
    hi: {
      allowed_interim_actions: [
        'आराम करें और सामान्य रूप से तरल लें।',
        'आरामदायक हल्के कपड़े पहनें और कमरे में सहज हवा रखें।',
        'प्रतीक्षा के दौरान देखें कि लक्षण बढ़ तो नहीं रहे हैं।',
      ],
      prohibited_actions: [
        'डॉक्टर के बिना एंटीबायोटिक या पर्चे की दवा शुरू न करें।',
        'बर्फ़ के पानी से न नहाएँ और अत्यधिक ठंडा न करें।',
      ],
      red_flags: [
        'साँस में कठिनाई, अत्यधिक उनींदापन, भ्रम, बेहोशी या दौरा',
        'तरल न पी पाना, बहुत कम पेशाब या पानी की गंभीर कमी के संकेत',
        'लक्षण तेज़ी से बिगड़ना या बहुत छोटे बच्चे, कमजोर बुज़ुर्ग अथवा गर्भवती व्यक्ति में बुखार',
      ],
      escalation_message:
        'कोई चेतावनी संकेत आए या व्यक्ति की हालत बिगड़े तो तुरंत प्रत्यक्ष चिकित्सा सहायता लें।',
      disclaimer: disclaimer.hi,
    },
  },
  MINOR_SPRAIN_STRAIN: {
    en: {
      allowed_interim_actions: [
        'Protect and rest the injured area.',
        'Apply a wrapped cool pack briefly; do not place ice directly on skin.',
        'Elevate the area when comfortable.',
      ],
      prohibited_actions: [
        'Do not force movement or continue strenuous activity.',
        'Do not tightly wrap the area or apply strong massage.',
      ],
      red_flags: [
        'Obvious deformity, severe swelling, or rapidly worsening pain',
        'Numbness, weakness, or the area becoming pale, blue, or cold',
        'Inability to use the limb or bear weight after the injury',
      ],
      escalation_message:
        'Arrange prompt in-person assessment if any warning sign appears or function is significantly limited.',
      disclaimer: disclaimer.en,
    },
    hi: {
      allowed_interim_actions: [
        'चोट वाली जगह को सुरक्षित रखें और आराम दें।',
        'कपड़े में लपेटा ठंडा पैक थोड़ी देर लगाएँ; बर्फ़ सीधे त्वचा पर न लगाएँ।',
        'आरामदायक हो तो चोट वाली जगह को ऊपर रखें।',
      ],
      prohibited_actions: [
        'जबरदस्ती हरकत न करें और कठिन गतिविधि जारी न रखें।',
        'बहुत कसकर पट्टी न बाँधें और तेज़ मालिश न करें।',
      ],
      red_flags: [
        'स्पष्ट विकृति, बहुत सूजन या तेज़ी से बढ़ता दर्द',
        'सुन्नपन, कमजोरी या जगह का पीला, नीला अथवा ठंडा होना',
        'चोट के बाद अंग का उपयोग या उस पर वजन न डाल पाना',
      ],
      escalation_message:
        'कोई चेतावनी संकेत आए या अंग का उपयोग बहुत सीमित हो तो शीघ्र प्रत्यक्ष जाँच कराएँ।',
      disclaimer: disclaimer.hi,
    },
  },
  MILD_ACIDITY_INDIGESTION: {
    en: {
      allowed_interim_actions: [
        'Eat small, simple meals if hungry.',
        'Remain upright after eating.',
        'Sip water normally and avoid foods that clearly worsen your symptoms.',
      ],
      prohibited_actions: [
        'Do not start a new medicine without clinician or pharmacist guidance.',
        'Do not lie flat immediately after a meal.',
      ],
      red_flags: [
        'Chest pressure or pain, breathing difficulty, sweating, faintness, or pain spreading to the arm, jaw, or back',
        'Vomiting blood, black stools, severe abdominal pain, or repeated vomiting',
        'Trouble swallowing or rapidly worsening symptoms',
      ],
      escalation_message:
        'Seek urgent in-person help for chest symptoms, bleeding, severe pain, or rapid worsening.',
      disclaimer: disclaimer.en,
    },
    hi: {
      allowed_interim_actions: [
        'भूख हो तो थोड़ा और साधारण भोजन लें।',
        'खाने के बाद सीधे बैठे या खड़े रहें।',
        'सामान्य रूप से थोड़ा-थोड़ा पानी पिएँ और स्पष्ट रूप से परेशानी बढ़ाने वाले भोजन से बचें।',
      ],
      prohibited_actions: [
        'डॉक्टर या फार्मासिस्ट की सलाह के बिना नई दवा शुरू न करें।',
        'भोजन के तुरंत बाद सीधा न लेटें।',
      ],
      red_flags: [
        'सीने में दबाव या दर्द, साँस में कठिनाई, पसीना, बेहोशी जैसा लगना या दर्द का हाथ, जबड़े या पीठ तक जाना',
        'खून की उल्टी, काला मल, तेज़ पेट दर्द या बार-बार उल्टी',
        'निगलने में कठिनाई या लक्षणों का तेज़ी से बिगड़ना',
      ],
      escalation_message:
        'सीने के लक्षण, खून, तेज़ दर्द या तेजी से बिगड़ने पर तुरंत प्रत्यक्ष सहायता लें।',
      disclaimer: disclaimer.hi,
    },
  },
  MINOR_SUPERFICIAL_CUT: {
    en: {
      allowed_interim_actions: [
        'Rinse a minor surface cut with clean running water.',
        'Use gentle pressure with a clean cloth for minor bleeding.',
        'Cover it with a clean dressing.',
      ],
      prohibited_actions: [
        'Do not pour harsh chemicals into the wound.',
        'Do not dig out a deeply embedded object or close a deep wound yourself.',
      ],
      red_flags: [
        'Bleeding that is heavy or does not stop with pressure',
        'A deep or gaping wound, loss of feeling or movement, or an embedded object',
        'An animal or human bite, heavily contaminated wound, or spreading redness and swelling',
      ],
      escalation_message:
        'Seek prompt in-person care for uncontrolled bleeding, deep wounds, bites, contamination, or loss of function.',
      disclaimer: disclaimer.en,
    },
    hi: {
      allowed_interim_actions: [
        'हल्की सतही कट को साफ़ बहते पानी से धोएँ।',
        'हल्के रक्तस्राव पर साफ़ कपड़े से धीरे दबाव दें।',
        'साफ़ ड्रेसिंग से ढकें।',
      ],
      prohibited_actions: [
        'घाव में तेज़ रसायन न डालें।',
        'गहराई में फँसी वस्तु स्वयं न निकालें और गहरे घाव को स्वयं बंद न करें।',
      ],
      red_flags: [
        'बहुत रक्तस्राव या दबाव देने पर भी रक्तस्राव न रुकना',
        'गहरा या खुला घाव, संवेदना या हरकत कम होना अथवा कोई वस्तु फँसी होना',
        'जानवर या इंसान का काटना, बहुत दूषित घाव या फैलती लालिमा और सूजन',
      ],
      escalation_message:
        'अनियंत्रित रक्तस्राव, गहरे घाव, काटने, दूषण या कार्यक्षमता कम होने पर शीघ्र प्रत्यक्ष देखभाल लें।',
      disclaimer: disclaimer.hi,
    },
  },
  MILD_ANXIETY_PANIC: {
    en: {
      allowed_interim_actions: [
        'Move to a quiet, safe place if possible.',
        'Try slow, comfortable breathing without forcing or holding your breath.',
        'Contact a trusted person and stay with them if that feels helpful.',
      ],
      prohibited_actions: [
        'Do not use alcohol, recreational drugs, or someone else’s medicine to manage symptoms.',
        'Do not drive if you feel faint, confused, or unable to concentrate.',
      ],
      red_flags: [
        'Thoughts or plans of suicide, self-harm, or harm to someone else',
        'Chest pain, fainting, severe breathing difficulty, confusion, or new neurological symptoms',
        'Feeling unable to stay safe or symptoms that are severe or rapidly worsening',
      ],
      escalation_message:
        'If there is immediate danger, self-harm risk, chest pain, fainting, or severe breathing difficulty, seek emergency help now.',
      disclaimer: disclaimer.en,
    },
    hi: {
      allowed_interim_actions: [
        'संभव हो तो शांत और सुरक्षित जगह पर जाएँ।',
        'साँस को रोके या ज़बरदस्ती किए बिना धीरे और सहज रूप से साँस लें।',
        'किसी भरोसेमंद व्यक्ति से संपर्क करें और सहायक लगे तो उनके साथ रहें।',
      ],
      prohibited_actions: [
        'लक्षण सँभालने के लिए शराब, नशीले पदार्थ या किसी और की दवा का उपयोग न करें।',
        'बेहोशी जैसा, भ्रम या ध्यान न लगने पर वाहन न चलाएँ।',
      ],
      red_flags: [
        'आत्महत्या, स्वयं को नुकसान या किसी और को नुकसान पहुँचाने के विचार अथवा योजना',
        'सीने में दर्द, बेहोशी, साँस की गंभीर कठिनाई, भ्रम या नए तंत्रिका संबंधी लक्षण',
        'स्वयं को सुरक्षित न रख पाने का एहसास या गंभीर अथवा तेजी से बिगड़ते लक्षण',
      ],
      escalation_message:
        'तुरंत खतरा, स्वयं को नुकसान का जोखिम, सीने में दर्द, बेहोशी या साँस की गंभीर कठिनाई हो तो अभी आपातकालीन सहायता लें।',
      disclaimer: disclaimer.hi,
    },
  },
};

const suppressionContent: Record<
  'en' | 'hi',
  Record<'UNSUPPORTED' | 'HIGH_RISK' | 'EMERGENCY', LocalizedGuidance>
> = {
  en: {
    UNSUPPORTED: {
      allowed_interim_actions: [],
      prohibited_actions: [
        'Do not rely on generic self-care advice or start a new medicine while waiting.',
      ],
      red_flags: ['Any severe, rapidly worsening, or concerning symptom'],
      escalation_message:
        'This symptom pattern is not supported by the interim guidance library. Contact a clinician; seek urgent in-person help if symptoms worsen or concern you.',
      disclaimer: disclaimer.en,
    },
    HIGH_RISK: {
      allowed_interim_actions: [],
      prohibited_actions: [
        'Do not use generic self-care guidance or start, stop, or change medicines without a clinician.',
      ],
      red_flags: [
        'Any new severe symptom, rapid worsening, breathing difficulty, confusion, fainting, or concern about medicines or allergy',
      ],
      escalation_message:
        'Because a higher-risk factor is present, no generic interim recommendation is shown. Contact a clinician for individualized advice and seek urgent help if symptoms worsen.',
      disclaimer: disclaimer.en,
    },
    EMERGENCY: {
      allowed_interim_actions: [],
      prohibited_actions: [
        'Do not wait for online guidance or assume the app can rule out an emergency.',
      ],
      red_flags: ['An emergency warning sign has been recorded'],
      escalation_message:
        'Seek urgent in-person or emergency care now and follow the existing emergency referral pathway.',
      disclaimer: disclaimer.en,
    },
  },
  hi: {
    UNSUPPORTED: {
      allowed_interim_actions: [],
      prohibited_actions: [
        'प्रतीक्षा के दौरान सामान्य स्व-देखभाल सलाह पर निर्भर न रहें और नई दवा शुरू न करें।',
      ],
      red_flags: ['कोई भी गंभीर, तेज़ी से बिगड़ता या चिंताजनक लक्षण'],
      escalation_message:
        'यह लक्षण पैटर्न अंतरिम मार्गदर्शन लाइब्रेरी में समर्थित नहीं है। डॉक्टर से संपर्क करें; लक्षण बिगड़ें या चिंता हो तो तुरंत प्रत्यक्ष सहायता लें।',
      disclaimer: disclaimer.hi,
    },
    HIGH_RISK: {
      allowed_interim_actions: [],
      prohibited_actions: [
        'डॉक्टर के बिना सामान्य स्व-देखभाल मार्गदर्शन का उपयोग न करें और दवा शुरू, बंद या बदलें नहीं।',
      ],
      red_flags: [
        'कोई नया गंभीर लक्षण, तेज़ी से बिगड़ना, साँस में कठिनाई, भ्रम, बेहोशी या दवा अथवा एलर्जी की चिंता',
      ],
      escalation_message:
        'अधिक जोखिम वाला कारक मौजूद होने के कारण सामान्य अंतरिम सलाह नहीं दिखाई जा रही है। व्यक्तिगत सलाह के लिए डॉक्टर से संपर्क करें और लक्षण बिगड़ें तो तुरंत सहायता लें।',
      disclaimer: disclaimer.hi,
    },
    EMERGENCY: {
      allowed_interim_actions: [],
      prohibited_actions: [
        'ऑनलाइन मार्गदर्शन की प्रतीक्षा न करें और यह न मानें कि ऐप आपातस्थिति को नकार सकता है।',
      ],
      red_flags: ['आपातकालीन चेतावनी संकेत दर्ज हुआ है'],
      escalation_message:
        'अभी तुरंत प्रत्यक्ष या आपातकालीन देखभाल लें और मौजूदा आपात रेफरल मार्ग का पालन करें।',
      disclaimer: disclaimer.hi,
    },
  },
};

export const safeCareInputSchema = z.object({
  structuredIntake: intakeStructuredOutputSchema,
  language: z.enum(['en', 'hi']),
  ageYears: z.number().int().min(0).max(120),
  redFlagDetected: z.boolean(),
});

export interface SafeCareClassificationModel {
  generate(input: z.infer<typeof safeCareInputSchema>): Promise<unknown>;
}

export async function createSafeCareGuidance(
  model: SafeCareClassificationModel,
  untrustedInput: unknown,
): Promise<SafeCareGuidance> {
  const input = safeCareInputSchema.parse(untrustedInput);
  if (input.redFlagDetected) return suppressed('EMERGENCY', input.language);
  if (hasHighRiskContext(input)) return suppressed('HIGH_RISK', input.language);

  let classification: z.infer<typeof safeCareClassificationSchema>;
  try {
    classification = await runAIWorkflow('safe_care', async () =>
      safeCareClassificationSchema.parse(await model.generate(input)),
    );
  } catch (error) {
    if (!isAIFailure(error)) throw error;
    return suppressed('UNSUPPORTED', input.language);
  }
  if (classification.symptom_category === 'UNSUPPORTED')
    return suppressed('UNSUPPORTED', input.language);
  return safeCareGuidanceSchema.parse({
    symptom_category: classification.symptom_category,
    ...SAFE_CARE_GUIDANCE_LIBRARY[classification.symptom_category][
      input.language
    ],
    language: input.language,
    disposition: 'GUIDANCE',
    library_version: SAFE_CARE_LIBRARY_VERSION,
  });
}

function hasHighRiskContext(
  input: z.infer<typeof safeCareInputSchema>,
): boolean {
  const pregnancy = input.structuredIntake.pregnancy_possibility;
  return (
    input.ageYears < 12 ||
    input.ageYears >= 70 ||
    (pregnancy.clinically_relevant &&
      ['possible', 'unsure'].includes(pregnancy.response)) ||
    input.structuredIntake.relevant_history.length > 0 ||
    input.structuredIntake.current_medicines.length > 0 ||
    input.structuredIntake.allergies.length > 0
  );
}

function suppressed(
  disposition: 'UNSUPPORTED' | 'HIGH_RISK' | 'EMERGENCY',
  language: 'en' | 'hi',
): SafeCareGuidance {
  return safeCareGuidanceSchema.parse({
    symptom_category: 'UNSUPPORTED',
    ...suppressionContent[language][disposition],
    language,
    disposition,
    library_version: SAFE_CARE_LIBRARY_VERSION,
  });
}

export const SAFE_CARE_CLASSIFICATION_INSTRUCTIONS = withAISecurityInstructions(
  `
Classify the structured patient intake into exactly one allowed symptom category.
Do not diagnose, recommend medicine, antibiotics, treatment, or dosage. Do not produce advice.
Use UNSUPPORTED unless the intake clearly describes a mild, low-risk example matching one category.
Return only the required structured classification.
`.trim(),
);
