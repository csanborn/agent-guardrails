import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isObject, stringField, type JsonObject } from './hook-io.js';

export const CONFIG_FILE = '.agent-guardrails.json';

export type RuleName = 'bypassComments' | 'noVerify' | 'forcePush' | 'recursiveRm' | 'testReminder';

export type Config = Record<RuleName, boolean> & {
  protectedBranches: readonly string[];
};

export const DEFAULT_CONFIG: Config = {
  bypassComments: true,
  noVerify: true,
  forcePush: true,
  recursiveRm: true,
  testReminder: true,
  protectedBranches: ['main', 'master'],
};

const RULE_NAMES: readonly RuleName[] = [
  'bypassComments',
  'noVerify',
  'forcePush',
  'recursiveRm',
  'testReminder',
];

/** Parses the config file text. Missing, unparsable or mistyped values fall back to defaults (AC-C2). */
export function parseConfig(text: string | undefined): Config {
  if (text === undefined) return DEFAULT_CONFIG;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return DEFAULT_CONFIG;
  }
  if (!isObject(raw)) return DEFAULT_CONFIG;

  const config: Config = { ...DEFAULT_CONFIG };
  for (const rule of RULE_NAMES) {
    const value = raw[rule];
    if (typeof value === 'boolean') config[rule] = value;
  }
  const branches = raw.protectedBranches;
  if (Array.isArray(branches) && branches.every((branch) => typeof branch === 'string')) {
    config.protectedBranches = branches;
  }
  return config;
}

/** The project directory: `CLAUDE_PROJECT_DIR` when Claude Code sets it, else the hook's `cwd` (AC-C1). */
export function projectDir(input: JsonObject): string {
  return process.env.CLAUDE_PROJECT_DIR ?? stringField(input, 'cwd') ?? process.cwd();
}

export function loadConfig(dir: string): Config {
  let text: string | undefined;
  try {
    text = readFileSync(join(dir, CONFIG_FILE), 'utf8');
  } catch {
    text = undefined;
  }
  return parseConfig(text);
}
