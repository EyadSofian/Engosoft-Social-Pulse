/**
 * Runtime design skills. A skill is one specialist of the creative team (layout designer, lighting
 * director, hook writer…): its rules, the typed decision it returns, and a version. A stage composes
 * several skills into one structured model call; each skill answers in its own field, so decisions
 * stay separate, typed, logged and replaceable — no single hard-coded mega prompt.
 */
import { openAIJson } from '../generation/provider.js';

export type JsonSchema = Record<string, unknown>;
export type StageContent = Parameters<typeof openAIJson>[0]['content'][number];

export interface DesignSkill<Id extends string = string> {
  id: Id;
  version: string;
  /** What this specialist decides, in one line. */
  purpose: string;
  /** How a professional in this role thinks; handed to the model when the skill runs. */
  rules: string[];
  /** Strict JSON schema of the decision this skill returns. */
  schema: JsonSchema;
}

/* Strict-mode schema helpers: every object closes its properties and requires all of them. */
export const str = (description?: string): JsonSchema => ({ type: 'string', ...(description ? { description } : {}) });
export const num = (description?: string): JsonSchema => ({ type: 'number', ...(description ? { description } : {}) });
export const oneOf = <T extends string>(values: readonly T[], description?: string): JsonSchema => ({ type: 'string', enum: [...values], ...(description ? { description } : {}) });
export const list = (items: JsonSchema, description?: string): JsonSchema => ({ type: 'array', items, ...(description ? { description } : {}) });
export const obj = (properties: Record<string, JsonSchema>, description?: string): JsonSchema => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties, ...(description ? { description } : {}) });
/** A region in normalized canvas coordinates (0..1 from the top-left), so plans are format-independent. */
export const zone = (description?: string) => obj({ x: num(), y: num(), width: num(), height: num() }, description);
export interface Zone { x: number; y: number; width: number; height: number }

/** Skill id → its version, stored on every creative so a design can be traced to the rules that made it. */
export const skillVersions = (skills: DesignSkill[]) => Object.fromEntries(skills.map((s) => [s.id, s.version]));

/** The instructions of a stage: the team brief, then each specialist's section. */
export function stageInstructions(intro: string, skills: DesignSkill[]): string {
  return [
    intro,
    'Each section below is one specialist of the team. Answer every specialist in its own field of the JSON, keyed by the specialist id, deciding only what that specialist owns and staying consistent with the others.',
    ...skills.map((s) => `## ${s.id} (${s.version})\n${s.purpose}\n${s.rules.map((r) => `- ${r}`).join('\n')}`),
  ].join('\n\n');
}

export const stageSchema = (skills: DesignSkill[]) => obj(Object.fromEntries(skills.map((s) => [camel(s.id), s.schema])));
export const camel = (id: string) => id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** Runs one stage: a structured call where each composed skill fills its own typed field. */
export async function runStage<T>(input: {
  name: string;
  intro: string;
  skills: DesignSkill[];
  content: StageContent[];
  env: NodeJS.ProcessEnv;
  reasoning?: 'low' | 'medium' | 'high';
  model?: string;
}): Promise<T> {
  return openAIJson<T>({
    apiKey: input.env.OPENAI_API_KEY ?? '', model: input.model || input.env.OPENAI_CREATIVE_TEXT_MODEL?.trim() || 'gpt-5.5', reasoning: input.reasoning ?? 'medium',
    schemaName: `engosoft_${input.name}`, schema: stageSchema(input.skills),
    instructions: stageInstructions(input.intro, input.skills),
    content: input.content,
  });
}
