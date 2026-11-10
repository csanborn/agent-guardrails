import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { loadConfig, projectDir } from '../config.js';
import { denyToolUse, objectField, runHook, stringField } from '../hook-io.js';
import { checkCommand } from '../rules/dangerous-commands.js';

function git(dir: string, args: readonly string[]): string | undefined {
  try {
    const output = execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    return output === '' ? undefined : output;
  } catch {
    return undefined;
  }
}

runHook((input) => {
  const command = stringField(objectField(input, 'tool_input'), 'command');
  if (command === undefined) return undefined;

  const dir = projectDir(input);
  const config = loadConfig(dir);
  const findings = checkCommand(command, {
    cwd: stringField(input, 'cwd') ?? dir,
    home: homedir(),
    projectDir: dir,
    protectedBranches: config.protectedBranches,
    repoRoot: (at) => git(at, ['rev-parse', '--show-toplevel']),
    currentBranch: (at) => git(at, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
  }).filter((finding) => config[finding.rule]);

  if (findings.length === 0) return undefined;
  return denyToolUse([...new Set(findings.map((finding) => finding.message))].join('\n'));
});
