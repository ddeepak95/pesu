import type { Question } from "@/types/assignment";

/** Fixed demo assignment for the Konvo voice prototype settings UI. */
export const KONVO_DEMO_ASSIGNMENT = {
  title: "Exploring photosynthesis",
  student_instructions:
    "Have a short voice conversation with Konvo about how plants make food from sunlight.",
  max_attempts: 3,
  shared_context:
    "Middle-school science. Keep explanations accessible and encourage the student to reason aloud.",
};

export const KONVO_DEMO_QUESTION: Question = {
  order: 0,
  prompt:
    "Explain the process of photosynthesis in your own words. What do plants need, and what do they produce?",
  total_points: 10,
  rubric: [
    {
      item: "Mentions sunlight/light as an input",
      points: 3,
    },
    {
      item: "Mentions water and carbon dioxide as inputs",
      points: 3,
    },
    {
      item: "Mentions glucose/sugar and oxygen as outputs",
      points: 4,
    },
  ],
  supporting_content: "",
  expected_answer:
    "Plants use sunlight, water, and carbon dioxide to produce glucose (food) and oxygen.",
};
