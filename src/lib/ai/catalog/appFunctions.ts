import { TEXT_CAPABILITY_KEY } from "@/lib/ai/capabilities/registry";

import { subFunctionBindingKey } from "./helpers";

/** Runtime keys for catalog-backed LLM routes. */
export type AppFunctionKey =
  | "text"
  | "text.chat_tutoring"
  | "text.evaluation"
  | "text.dynamic_questions"
  | "text.rubric_generation"
  | "text.mcq_generation"
  | "text.suggested_response_generation"
  | "text.transliteration"
  | "speech_to_text"
  | "text_to_speech";

export function parseAppFunctionKey(
  key: AppFunctionKey,
): { parentKey: string; subKey?: string } {
  if (key === "text") {
    return { parentKey: TEXT_CAPABILITY_KEY };
  }
  const dot = key.indexOf(".");
  if (dot === -1) {
    return { parentKey: key };
  }
  return {
    parentKey: key.slice(0, dot),
    subKey: key.slice(dot + 1),
  };
}

export function toAppFunctionKey(parentKey: string, subKey?: string): AppFunctionKey {
  if (!subKey) {
    return parentKey as AppFunctionKey;
  }
  return subFunctionBindingKey(parentKey, subKey) as AppFunctionKey;
}
