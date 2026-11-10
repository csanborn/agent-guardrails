import { extname } from 'node:path';

interface Directive {
  label: string;
  pattern: RegExp;
  /** Limits the directive to these file extensions. Omitted means every non-prose file. */
  extensions?: ReadonlySet<string>;
}

const PYTHON = new Set(['.py', '.pyi']);

// Each pattern needs a comment opener before the directive, so prose and identifiers
// that merely mention the word do not match.
const DIRECTIVES: readonly Directive[] = [
  {
    label: 'eslint-disable',
    pattern: /(?:\/\/|\/\*+|<!--)\s*eslint-disable(?:-next-line|-line)?(?![\w-])/g,
  },
  { label: '@ts-ignore', pattern: /(?:\/\/|\/\*+|^\s*\*)\s*@ts-ignore\b/gm },
  { label: '@ts-nocheck', pattern: /(?:\/\/|\/\*+|^\s*\*)\s*@ts-nocheck\b/gm },
  {
    label: '@ts-expect-error without a reason',
    pattern: /(?:\/\/|\/\*+)\s*@ts-expect-error(?![\w-])[ \t:-]*(?:\*\/\}?)?[ \t]*$/gm,
  },
  { label: 'svelte-ignore', pattern: /(?:<!--|\/\/|\/\*+)\s*svelte-ignore\b/g },
  { label: '# noqa', pattern: /#\s*noqa\b/gi, extensions: PYTHON },
  { label: '# type: ignore', pattern: /#\s*type:\s*ignore\b/g, extensions: PYTHON },
];

const PROSE_EXTENSIONS = new Set(['.md', '.mdx', '.markdown', '.txt', '.rst']);

/** Prose files document these directives rather than use them (AC-E7). */
function isProseFile(filePath: string): boolean {
  return PROSE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

/**
 * Returns the labels of bypass directives that `after` has more of than `before`.
 * Comparing counts means an edit that keeps an existing directive is not blamed for it (AC-E6).
 */
export function addedBypasses(filePath: string, before: string, after: string): string[] {
  if (isProseFile(filePath)) return [];
  const extension = extname(filePath).toLowerCase();
  return DIRECTIVES.filter(
    ({ pattern, extensions }) =>
      (extensions === undefined || extensions.has(extension)) &&
      countMatches(after, pattern) > countMatches(before, pattern),
  ).map(({ label }) => label);
}

export function bypassMessage(labels: readonly string[], filePath: string): string {
  const list = labels.map((label) => `\`${label}\``).join(', ');
  return [
    `agent-guardrails blocked this edit to ${filePath}: it adds ${list}.`,
    'Fix the lint or type error the comment would hide instead of suppressing it.',
    'A `@ts-expect-error` with a short reason is allowed when a type gap is genuinely outside your control.',
    'If a suppression really is the right call, explain why to the user and let them add it.',
  ].join(' ');
}
