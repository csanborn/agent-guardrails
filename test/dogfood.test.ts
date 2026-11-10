import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addedBypasses } from '../src/rules/bypass-comments.js';

const ROOT = join(import.meta.dirname, '..');
const files = [
  ...readdirSync(join(ROOT, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts'))
    .map((path) => join('src', path)),
  'eslint.config.js',
  'vitest.config.ts',
];

describe('this repository', () => {
  it.each(files)('AC-Q2 %s has no bypass comments', (path) => {
    expect(addedBypasses(path, '', readFileSync(join(ROOT, path), 'utf8'))).toEqual([]);
  });
});
