// Survey question types
export type SurveyQuestionType = "likert" | "open_ended";

export interface LikertOption {
  id: string;
  text: string;
  value: number; // e.g., 1-5
}

export interface LikertQuestion {
  order: number;
  type: "likert";
  prompt: string;
  options: LikertOption[]; // Custom options like "Strongly Disagree" to "Strongly Agree"
  required: boolean;
}

export interface OpenEndedQuestion {
  order: number;
  type: "open_ended";
  prompt: string;
  placeholder?: string;
  required: boolean;
}

export type SurveyQuestion = LikertQuestion | OpenEndedQuestion;

export interface Survey {
  id: string; // uuid pk
  survey_id: string; // short id (8-char nanoid)
  class_id: string; // classes.id (uuid)
  class_group_id?: string | null; // class_groups.id (uuid)
  title: string;
  description?: string | null;
  questions: SurveyQuestion[];
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "draft" | "active" | "deleted";
}

export interface SurveyResponse {
  id: string;
  survey_id: string;
  student_id: string;
  answers: SurveyAnswer[];
  submitted_at: string;
}

export interface SurveyAnswer {
  question_order: number;
  value: string | number; // string for open_ended, number for likert
}

// Preset Likert scale options for common use cases
export const LIKERT_PRESETS = {
  agreement_5: [
    { id: "1", text: "Strongly Disagree", value: 1 },
    { id: "2", text: "Disagree", value: 2 },
    { id: "3", text: "Neutral", value: 3 },
    { id: "4", text: "Agree", value: 4 },
    { id: "5", text: "Strongly Agree", value: 5 },
  ],
  satisfaction_5: [
    { id: "1", text: "Very Dissatisfied", value: 1 },
    { id: "2", text: "Dissatisfied", value: 2 },
    { id: "3", text: "Neutral", value: 3 },
    { id: "4", text: "Satisfied", value: 4 },
    { id: "5", text: "Very Satisfied", value: 5 },
  ],
  frequency_5: [
    { id: "1", text: "Never", value: 1 },
    { id: "2", text: "Rarely", value: 2 },
    { id: "3", text: "Sometimes", value: 3 },
    { id: "4", text: "Often", value: 4 },
    { id: "5", text: "Always", value: 5 },
  ],
  likelihood_5: [
    { id: "1", text: "Very Unlikely", value: 1 },
    { id: "2", text: "Unlikely", value: 2 },
    { id: "3", text: "Neutral", value: 3 },
    { id: "4", text: "Likely", value: 4 },
    { id: "5", text: "Very Likely", value: 5 },
  ],
} as const;

export type LikertPresetKey = keyof typeof LIKERT_PRESETS;
