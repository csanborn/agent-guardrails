import { describe, expect, it } from 'vitest';
import {
  classifyFile,
  EMPTY_STATE,
  parseState,
  recordEdit,
  reminderFor,
  type FileKind,
} from '../src/rules/test-reminder.js';

describe('classifyFile', () => {
  it.each<[string, FileKind]>([
    ['src/auth/session.ts', 'source'],
    ['src/components/Button.tsx', 'source'],
    ['src/routes/+page.svelte', 'source'],
    ['app/models/user.rb', 'source'],
    ['pkg/server/handler.go', 'source'],
    ['service/api.py', 'source'],
    ['src/auth/session.test.ts', 'test'],
    ['src/components/Button.spec.tsx', 'test'],
    ['pkg/server/handler_test.go', 'test'],
    ['tests/test_api.py', 'test'],
    ['service/test_api.py', 'test'],
    ['spec/models/user_spec.rb', 'test'],
    ['src/test/java/com/acme/UserServiceTest.java', 'test'],
    ['src/__tests__/session.ts', 'test'],
    ['test/fixtures/user.json', 'test'],
    ['e2e/login.ts', 'test'],
    ['vite.config.ts', 'other'],
    ['eslint.config.js', 'other'],
    ['src/types/env.d.ts', 'other'],
    ['.prettierrc.cjs', 'other'],
    ['README.md', 'other'],
    ['package.json', 'other'],
    ['src/styles/app.css', 'other'],
    ['Dockerfile', 'other'],
  ])('AC-T5 %s is %s', (path, kind) => {
    expect(classifyFile(path)).toBe(kind);
  });
});

describe('reminderFor', () => {
  it('AC-T2 reminds when source changed and no test did, listing the files', () => {
    const state = recordEdit(EMPTY_STATE, 'source', 'src/a.ts');
    const reminder = reminderFor(state);
    expect(reminder).toMatch(/changed 1 source file \(src\/a\.ts\) and no test files/);
    expect(reminder).toMatch(/Add or update tests/);
  });

  it('AC-T2 lists at most five files', () => {
    let state = EMPTY_STATE;
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) state = recordEdit(state, 'source', `src/${name}.ts`);
    const reminder = reminderFor(state) ?? '';
    expect(reminder).toContain('7 source files');
    expect(reminder).toContain('src/e.ts and 2 more');
    expect(reminder).not.toContain('src/f.ts');
  });

  it('AC-T2 is silent when nothing changed', () => {
    expect(reminderFor(EMPTY_STATE)).toBeUndefined();
  });

  it('AC-T4 is silent once any test file changed', () => {
    const state = recordEdit(recordEdit(EMPTY_STATE, 'source', 'src/a.ts'), 'test', 'src/a.test.ts');
    expect(reminderFor(state)).toBeUndefined();
  });

  it('AC-T4 reminds once, and re-arms on a new source file', () => {
    const first = recordEdit(EMPTY_STATE, 'source', 'src/a.ts');
    const reminded = { ...first, reminded: true };
    expect(reminderFor(reminded)).toBeUndefined();
    expect(reminderFor(recordEdit(reminded, 'source', 'src/a.ts'))).toBeUndefined();
    expect(reminderFor(recordEdit(reminded, 'source', 'src/b.ts'))).toContain('src/a.ts, src/b.ts');
  });
});

describe('parseState', () => {
  it('reads a saved state and drops anything malformed', () => {
    expect(parseState({ sources: ['a.ts', 3], tests: 'nope', reminded: true })).toEqual({
      sources: ['a.ts'],
      tests: [],
      reminded: true,
    });
    expect(parseState(null)).toEqual(EMPTY_STATE);
  });
});
