/**
 * The four screening questions, in order, with the 0–5 rubric each answer is
 * scored against. Rubrics live here (not in the DB) so a rubric change is a
 * code review, and the scoring prompt and the admin review page always show
 * the same text.
 */

export const READ_SECONDS = 30;
export const RECORD_SECONDS = 90;
export const MAX_TAKES = 2; // first take + one retake

export type ScreeningQuestion = {
  key: string;
  position: number;
  prompt: string;
  hint: string;
  rubric: {
    five: string;
    three: string;
    one: string;
    penalise: string;
  };
};

export const SCREENING_QUESTIONS: ScreeningQuestion[] = [
  {
    key: "proud_build",
    position: 1,
    prompt:
      "Tell us about something you've built that you're proud of. What was your part in it, and what was hard about it?",
    hint: "Pick one thing and go deep rather than listing several.",
    rubric: {
      five:
        "One specific project, described with concrete detail: what it was, exactly what they personally did (not \"we\"), and a genuine difficulty with how they worked through it. You could retell the story afterwards.",
      three:
        "A real project and a real personal role, but thin on the hard part — the difficulty is generic (\"deadlines\", \"learning the framework\") or the resolution is vague.",
      one:
        "A list of projects with no depth, or a description so generic it could be anyone's work. No identifiable personal contribution, no specific difficulty.",
      penalise:
        "Listing several projects instead of going deep on one; claiming the whole team's work as their own with no specifics; difficulties with no account of what they did about them.",
    },
  },
  {
    key: "figma_process",
    position: 2,
    prompt:
      "Walk us through how you'd take a Figma design and turn it into production code. What do you check before you start writing anything?",
    hint: "We care about your process, not a tool list.",
    rubric: {
      five:
        "A concrete pre-coding checklist: inspecting spacing/typography/colour values against the design system, checking responsive behaviour and breakpoints, identifying reusable components, spotting states the design doesn't show (hover, empty, error, loading), and asking the designer when something is ambiguous. Fidelity to the design is treated as the point, not an afterthought.",
      three:
        "A sensible general process (look at the design, break it into components, build, compare) but misses most of the checking step — little about measuring values, missing states, or querying ambiguity.",
      one:
        "Jumps straight to \"I'd start coding\" or recites tool names. No evidence they compare their output against the design, no notion of design fidelity.",
      penalise:
        "Tool lists in place of process; no mention of checking the built result against the design; treating the design as a rough suggestion.",
    },
  },
  {
    key: "ai_wrong",
    position: 3,
    prompt:
      "Tell us about a time an AI tool wrote you code that was wrong. How did you notice, and what did you do?",
    hint: "We give the team AI tools — we're interested in how you work with them.",
    rubric: {
      five:
        "A specific incident: what the AI produced, the concrete way the wrongness surfaced (failing test, review, bug report, reading the code and spotting it), and what they did — fixed it themselves, understood why it was wrong, adjusted how they use the tool. Shows they verify AI output rather than trust it.",
      three:
        "Genuine verification habits (tests first, reading diffs, double-checking output before it ships) but no specific incident — or a plausible-but-vague incident (\"it gave me wrong code, I fixed it\") with little detail on how they noticed or what changed in their workflow.",
      one:
        "No mechanism for catching AI errors at all: ships AI code unread, claims AI output is always right, or uses AI tools extensively and has never once noticed a mistake.",
      penalise:
        "Claiming AI output is always right; describing shipping AI code without tests or reading the diff. A general-practices answer that shows real verification habits is a 3, not a 1.",
    },
  },
  {
    key: "logistics",
    position: 4,
    prompt:
      "This role is fully on-site at our Chattogram office, Monday to Friday, 9am to 5pm UK time. Talk us through how that fits your situation.",
    hint: "Be straight with us — it's better for both of us to know now.",
    rubric: {
      five:
        "Directly confirms they live in or can be in Chattogram for daily on-site work, and engages specifically with the 9–5 UK time (roughly 2pm–10pm local) shift — how it fits commute, family, other commitments. Straight answer, no hedging.",
      three:
        "Says it works but skates over the specifics — doesn't address either the on-site requirement or the evening-shifted hours concretely, or gives a conditional answer (\"I could relocate\") without a timeline.",
      one:
        "Avoids the question, answers about remote work, is not in or near Chattogram with no concrete relocation plan, or the stated situation is incompatible with the hours.",
      penalise:
        "Vagueness on where they actually live; answering a different question (motivation, salary); any mismatch between this answer and the CV location that should be flagged as location_risk rather than guessed away.",
    },
  },
];

export function getQuestion(key: string): ScreeningQuestion | undefined {
  return SCREENING_QUESTIONS.find((q) => q.key === key);
}

export const SCREENING_FLAGS = [
  "contradicts_cv",
  "no_specifics",
  "sounds_scripted",
  "did_not_answer",
  "location_risk",
  "poor_audio",
] as const;

export type ScreeningFlag = (typeof SCREENING_FLAGS)[number];
