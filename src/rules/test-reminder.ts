import { basename, extname } from 'node:path';

export type FileKind = 'source' | 'test' | 'other';

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.svelte', '.vue', '.astro',
  '.py', '.go', '.rb', '.java', '.kt', '.scala', '.rs', '.cs', '.swift', '.php',
  '.c', '.cc', '.cpp', '.h', '.hpp', '.ex', '.exs', '.dart',
]);
const TEST_DIRECTORIES = new Set(['test', 'tests', '__tests__', 'spec', 'specs', 'e2e']);
const TEST_FILE_NAMES = [
  /\.(test|spec)\.[^.]+$/,
  /_(test|spec)\.[^.]+$/,
  /^test_.+\.py$/,
  /(Test|Tests|Spec)\.(java|kt|scala|cs|swift)$/,
];

/**
 * Classifies a project-relative path written with `/` separators (AC-T1, AC-T5).
 * Anything under a test folder counts as a test change, fixtures included.
 */
export function classifyFile(relativePath: string): FileKind {
  const segments = relativePath.split('/');
  const name = basename(relativePath);
  if (segments.slice(0, -1).some((segment) => TEST_DIRECTORIES.has(segment))) return 'test';
  if (TEST_FILE_NAMES.some((pattern) => pattern.test(name))) return 'test';
  if (name.startsWith('.') || name.endsWith('.d.ts') || /\.config\.[^.]+$/.test(name)) return 'other';
  return SOURCE_EXTENSIONS.has(extname(name)) ? 'source' : 'other';
}

export interface SessionState {
  sources: string[];
  tests: string[];
  reminded: boolean;
}

export const EMPTY_STATE: SessionState = { sources: [], tests: [], reminded: false };

/** Records an edited file. A source file not seen before re-arms the reminder (AC-T4). */
export function recordEdit(state: SessionState, kind: FileKind, path: string): SessionState {
  if (kind === 'test' && !state.tests.includes(path)) {
    return { ...state, tests: [...state.tests, path] };
  }
  if (kind === 'source' && !state.sources.includes(path)) {
    return { ...state, sources: [...state.sources, path], reminded: false };
  }
  return state;
}

const LISTED_FILES = 5;

/** The reminder to send at Stop, if one is due (AC-T2, AC-T4). */
export function reminderFor(state: SessionState): string | undefined {
  if (state.reminded || state.tests.length > 0 || state.sources.length === 0) return undefined;
  const shown = state.sources.slice(0, LISTED_FILES).join(', ');
  const more = state.sources.length > LISTED_FILES ? ` and ${String(state.sources.length - LISTED_FILES)} more` : '';
  const count = state.sources.length === 1 ? '1 source file' : `${String(state.sources.length)} source files`;
  return [
    `agent-guardrails: this session changed ${count} (${shown}${more}) and no test files.`,
    'Add or update tests that cover the change and run them.',
    'If tests genuinely do not apply, say why in one line. This reminder is sent once.',
  ].join(' ');
}

export function parseState(value: unknown): SessionState {
  if (typeof value !== 'object' || value === null) return EMPTY_STATE;
  const { sources, tests, reminded } = value as Partial<Record<keyof SessionState, unknown>>;
  const strings = (list: unknown) =>
    Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
  return { sources: strings(sources), tests: strings(tests), reminded: reminded === true };
}
