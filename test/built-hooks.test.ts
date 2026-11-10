// Runs the committed files in dist/ exactly as Claude Code does: a child process that
// reads one JSON payload on stdin and answers with an exit code and optional JSON.
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG_FILE } from '../src/config.js';
import { bashInput, editInput, postToolUse, preToolUse, sessionEnd, stop, writeInput } from './fixtures/payloads.js';

const DIST = join(import.meta.dirname, '..', 'dist');

let project: string;
let pluginData: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'guardrails-project-'));
  pluginData = mkdtempSync(join(tmpdir(), 'guardrails-data-'));
});

function run(hook: string, payload: unknown) {
  const result = spawnSync(process.execPath, [join(DIST, hook)], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_DATA: pluginData },
  });
  const output: unknown = result.stdout.trim() === '' ? undefined : JSON.parse(result.stdout);
  return { status: result.status, output, stderr: result.stderr };
}

function denial(reasonPattern: RegExp) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: expect.stringMatching(reasonPattern) as unknown,
    },
  };
}

function configure(config: Record<string, unknown>) {
  writeFileSync(join(project, CONFIG_FILE), JSON.stringify(config));
}

function gitRepo(branch: string) {
  execFileSync('git', ['init', '--quiet', '--initial-branch', branch, project]);
}

describe('dist/guard-edits.mjs', () => {
  it('AC-E8 denies an Edit that adds a bypass comment', () => {
    const file = join(project, 'src', 'app.ts');
    const result = run('guard-edits.mjs', preToolUse(project, 'Edit', editInput(file, 'run();', '// @ts-ignore\nrun();')));
    expect(result.status).toBe(0);
    expect(result.output).toEqual(denial(/src\/app\.ts: it adds `@ts-ignore`/));
  });

  it('AC-E1 denies a Write whose content adds eslint-disable', () => {
    const file = join(project, 'lib.js');
    const result = run('guard-edits.mjs', preToolUse(project, 'Write', writeInput(file, '/* eslint-disable */\nexport {};\n')));
    expect(result.output).toEqual(denial(/eslint-disable/));
  });

  it('AC-E1 denies a MultiEdit when any edit adds a bypass', () => {
    const file = join(project, 'main.py');
    const input = {
      file_path: file,
      edits: [
        { old_string: 'a = 1', new_string: 'a = 2' },
        { old_string: 'import os', new_string: 'import os  # noqa: F401' },
      ],
    };
    expect(run('guard-edits.mjs', preToolUse(project, 'MultiEdit', input)).output).toEqual(denial(/# noqa/));
  });

  it('AC-E6 allows a Write that keeps a directive already in the file', () => {
    const file = join(project, 'legacy.ts');
    writeFileSync(file, '// @ts-nocheck\nexport const a = 1;\n');
    const result = run('guard-edits.mjs', preToolUse(project, 'Write', writeInput(file, '// @ts-nocheck\nexport const a = 2;\n')));
    expect(result).toMatchObject({ status: 0, output: undefined });
  });

  it('AC-E5 allows @ts-expect-error with a reason', () => {
    const file = join(project, 'src', 'app.ts');
    const edit = editInput(file, 'sdk.beta();', '// @ts-expect-error the SDK types omit beta\nsdk.beta();');
    expect(run('guard-edits.mjs', preToolUse(project, 'Edit', edit))).toMatchObject({ status: 0, output: undefined });
  });

  it('AC-E7 allows documentation that mentions a directive', () => {
    const file = join(project, 'CONTRIBUTING.md');
    const write = writeInput(file, 'Never add `// eslint-disable` comments.');
    expect(run('guard-edits.mjs', preToolUse(project, 'Write', write)).output).toBeUndefined();
  });

  it('AC-C3 allows the bypass when bypassComments is false', () => {
    configure({ bypassComments: false });
    const file = join(project, 'src', 'app.ts');
    const edit = editInput(file, 'run();', '// @ts-ignore\nrun();');
    expect(run('guard-edits.mjs', preToolUse(project, 'Edit', edit))).toMatchObject({ status: 0, output: undefined });
  });
});

describe('dist/guard-bash.mjs', () => {
  it('AC-B1 denies git commit --no-verify', () => {
    const result = run('guard-bash.mjs', preToolUse(project, 'Bash', bashInput('git commit --no-verify -m "wip"')));
    expect(result.status).toBe(0);
    expect(result.output).toEqual(denial(/--no-verify/));
  });

  it('AC-B2 asks the real git for the current branch when no refspec is given', () => {
    gitRepo('main');
    const result = run('guard-bash.mjs', preToolUse(project, 'Bash', bashInput('git push --force')));
    expect(result.output).toEqual(denial(/force push to `main`/));
  });

  it('AC-B3 allows the same force push from a feature branch', () => {
    gitRepo('feature/login');
    const result = run('guard-bash.mjs', preToolUse(project, 'Bash', bashInput('git push --force')));
    expect(result).toMatchObject({ status: 0, output: undefined });
  });

  it('AC-B4 denies rm -rf on the project root', () => {
    const result = run('guard-bash.mjs', preToolUse(project, 'Bash', bashInput(`rm -rf ${project}`)));
    expect(result.output).toEqual(denial(/repository root/));
  });

  it('AC-B5 allows an ordinary command', () => {
    const result = run('guard-bash.mjs', preToolUse(project, 'Bash', bashInput('echo "git push --force origin main" && npm test')));
    expect(result).toMatchObject({ status: 0, output: undefined });
  });

  it('AC-C3 allows a force push when forcePush is false and keeps the other rules', () => {
    configure({ forcePush: false });
    const push = run('guard-bash.mjs', preToolUse(project, 'Bash', bashInput('git push -f origin main')));
    expect(push.output).toBeUndefined();
    const commit = run('guard-bash.mjs', preToolUse(project, 'Bash', bashInput('git commit -n -m x')));
    expect(commit.output).toEqual(denial(/--no-verify/));
  });
});

describe('dist/test-reminder.mjs', () => {
  const sourceFile = () => join(project, 'src', 'checkout.ts');
  const recordSource = () => run('test-reminder.mjs', postToolUse(project, 'Edit', editInput(sourceFile(), 'a', 'b')));

  it('AC-T2 reminds on Stop after a source-only change', () => {
    recordSource();
    const result = run('test-reminder.mjs', stop(project));
    expect(result.status).toBe(0);
    expect(result.output).toEqual({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: expect.stringMatching(/1 source file \(src\/checkout\.ts\)/) as unknown,
      },
    });
  });

  it('AC-T3 does not remind while stop_hook_active is true', () => {
    recordSource();
    expect(run('test-reminder.mjs', stop(project, true)).output).toBeUndefined();
  });

  it('AC-T4 reminds only once for the same changes', () => {
    recordSource();
    expect(run('test-reminder.mjs', stop(project)).output).toBeDefined();
    expect(run('test-reminder.mjs', stop(project)).output).toBeUndefined();
  });

  it('AC-T4 stays quiet when a test file changed too', () => {
    recordSource();
    run('test-reminder.mjs', postToolUse(project, 'Write', writeInput(join(project, 'src', 'checkout.test.ts'), 'it()')));
    expect(run('test-reminder.mjs', stop(project)).output).toBeUndefined();
  });

  it('AC-T1 ignores files outside the project', () => {
    run('test-reminder.mjs', postToolUse(project, 'Write', writeInput(join(tmpdir(), 'scratch.ts'), 'x')));
    expect(run('test-reminder.mjs', stop(project)).output).toBeUndefined();
  });

  it('AC-T6 deletes the session state on SessionEnd', () => {
    recordSource();
    const sessions = join(pluginData, 'sessions');
    expect(readdirSync(sessions)).toHaveLength(1);
    run('test-reminder.mjs', sessionEnd(project));
    expect(existsSync(sessions) ? readdirSync(sessions) : []).toHaveLength(0);
  });

  it('AC-C3 stays quiet when testReminder is false', () => {
    configure({ testReminder: false });
    recordSource();
    expect(run('test-reminder.mjs', stop(project)).output).toBeUndefined();
  });
});

describe('every built hook', () => {
  it.each(['guard-edits.mjs', 'guard-bash.mjs', 'test-reminder.mjs'])(
    'AC-H2 %s fails open on malformed input',
    (hook) => {
      for (const payload of ['', 'not json', '[]', '{"tool_input": 42}']) {
        expect(run(hook, payload)).toMatchObject({ status: 0, output: undefined, stderr: '' });
      }
    },
  );
});
