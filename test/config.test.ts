import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_FILE, DEFAULT_CONFIG, loadConfig, parseConfig, projectDir } from '../src/config.js';

describe('parseConfig', () => {
  it('AC-C2 uses defaults for a missing or unparsable file', () => {
    expect(parseConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(parseConfig('{ not json')).toEqual(DEFAULT_CONFIG);
    expect(parseConfig('[]')).toEqual(DEFAULT_CONFIG);
  });

  it('AC-C1 reads every documented key', () => {
    const config = parseConfig(
      JSON.stringify({
        bypassComments: false,
        noVerify: false,
        forcePush: false,
        recursiveRm: false,
        testReminder: false,
        protectedBranches: ['trunk'],
      }),
    );
    expect(config).toEqual({
      bypassComments: false,
      noVerify: false,
      forcePush: false,
      recursiveRm: false,
      testReminder: false,
      protectedBranches: ['trunk'],
    });
  });

  it('AC-C2 ignores unknown keys and falls back per key on a wrong type', () => {
    const config = parseConfig(JSON.stringify({ testReminder: 'no', protectedBranches: [1], extra: true, forcePush: false }));
    expect(config).toEqual({ ...DEFAULT_CONFIG, forcePush: false });
  });
});

describe('loadConfig and projectDir', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('AC-C1 reads the file from the project directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guardrails-config-'));
    writeFileSync(join(dir, CONFIG_FILE), JSON.stringify({ recursiveRm: false }));
    expect(loadConfig(dir).recursiveRm).toBe(false);
    expect(loadConfig(join(dir, 'missing'))).toEqual(DEFAULT_CONFIG);
  });

  it('AC-C1 prefers CLAUDE_PROJECT_DIR over the hook cwd', () => {
    vi.stubEnv('CLAUDE_PROJECT_DIR', '/work/app');
    expect(projectDir({ cwd: '/work/app/src' })).toBe('/work/app');
  });

  it('AC-C1 falls back to the hook cwd', () => {
    vi.stubEnv('CLAUDE_PROJECT_DIR', undefined);
    expect(projectDir({ cwd: '/work/app/src' })).toBe('/work/app/src');
  });
});
