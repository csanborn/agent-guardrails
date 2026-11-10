import { basename, isAbsolute, relative, resolve } from 'node:path';
import type { RuleName } from '../config.js';
import { splitCommands, type SimpleCommand } from './shell.js';

export interface ShellContext {
  /** Working directory the command starts in. */
  cwd: string;
  home: string;
  /** The project directory Claude Code is running in. */
  projectDir: string;
  protectedBranches: readonly string[];
  /** Root of the git work tree that contains `dir`, if any. */
  repoRoot: (dir: string) => string | undefined;
  /** Short name of the branch checked out in `dir`, if any. */
  currentBranch: (dir: string) => string | undefined;
}

export interface Finding {
  rule: Extract<RuleName, 'noVerify' | 'forcePush' | 'recursiveRm'>;
  message: string;
}

const MAX_NESTED_SHELLS = 3;
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);

/** Checks every simple command in `script` (AC-B6) and returns what it would block. */
export function checkCommand(script: string, context: ShellContext): Finding[] {
  return checkScript(script, context, context.cwd, 0);
}

function checkScript(
  script: string,
  context: ShellContext,
  startDir: string | undefined,
  depth: number,
): Finding[] {
  const findings: Finding[] = [];
  // `cd` changes where later commands in the same chain run, so track it. After a `cd`
  // we cannot resolve (`cd -`, `cd "$DIR"`), relative paths are no longer judged.
  let cwd = startDir;

  for (const raw of splitCommands(script)) {
    const words = unwrap(raw);
    const program = words[0] === undefined ? '' : basename(words[0]);
    const args = words.slice(1);

    if (program === 'cd') {
      const target = args.find((arg) => arg === '-' || !arg.startsWith('-'));
      const expanded = target === '-' ? undefined : expandHome(target ?? '~', context.home);
      if (expanded === undefined) cwd = undefined;
      else if (isAbsolute(expanded)) cwd = expanded;
      else if (cwd !== undefined) cwd = resolve(cwd, expanded);
    } else if (SHELLS.has(program) && depth < MAX_NESTED_SHELLS) {
      const inner = shellScriptArgument(args);
      if (inner !== undefined) findings.push(...checkScript(inner, context, cwd, depth + 1));
    } else if (program === 'git') {
      findings.push(...checkGit(args, cwd, context));
    } else if (program === 'rm') {
      findings.push(...checkRm(args, cwd, context));
    }
  }
  return findings;
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
// Wrapper programs that run the command after them, with the options that take a value.
const WRAPPER_OPTIONS_WITH_VALUES = new Map<string, ReadonlySet<string>>([
  ['sudo', new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U'])],
  ['env', new Set(['-u', '-C', '-S'])],
  ['exec', new Set(['-a'])],
  ['command', new Set()],
  ['nohup', new Set()],
  ['time', new Set(['-f', '-o'])],
]);

/** Drops leading `VAR=value` words and wrapper programs with their options (AC-B7). */
function unwrap(words: SimpleCommand): SimpleCommand {
  let rest = words;
  for (;;) {
    while (rest[0] !== undefined && ASSIGNMENT.test(rest[0])) rest = rest.slice(1);
    const head = rest[0];
    if (head === undefined) return rest;
    const valued = WRAPPER_OPTIONS_WITH_VALUES.get(basename(head));
    if (valued === undefined) return rest;
    let i = 1;
    while (i < rest.length) {
      const word = rest[i] ?? '';
      if (word === '--') {
        i += 1;
        break;
      }
      if (!word.startsWith('-') && !ASSIGNMENT.test(word)) break;
      i += valued.has(word) ? 2 : 1;
    }
    rest = rest.slice(i);
  }
}

/** The script passed to `sh -c` (or `bash -lc` and friends), if any. */
function shellScriptArgument(args: readonly string[]): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (!arg.startsWith('-')) return undefined;
    if (!arg.startsWith('--') && arg.includes('c')) return args[i + 1];
  }
  return undefined;
}

function expandHome(path: string, home: string): string | undefined {
  const expanded = path
    .replace(/^~(?=\/|$)/, home)
    .replace(/^\$\{HOME\}(?=\/|$)/, home)
    .replace(/^\$HOME(?=\/|$)/, home);
  // Any other variable or substitution has a value we cannot know.
  return /[$`]/.test(expanded) ? undefined : expanded;
}

// Git options that come before the subcommand and take a separate value.
const GIT_GLOBAL_OPTIONS_WITH_VALUES = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--super-prefix',
  '--config-env',
]);

function checkGit(args: readonly string[], cwd: string | undefined, context: ShellContext): Finding[] {
  let dir = cwd;
  let i = 0;
  while (i < args.length && (args[i] ?? '').startsWith('-')) {
    const option = args[i] ?? '';
    if (option === '-C') {
      const expanded = expandHome(args[i + 1] ?? '.', context.home);
      dir = expanded === undefined || dir === undefined ? undefined : resolve(dir, expanded);
    }
    i += GIT_GLOBAL_OPTIONS_WITH_VALUES.has(option) ? 2 : 1;
  }
  const subcommand = args[i];
  const rest = args.slice(i + 1);
  if (subcommand === 'commit') return checkCommit(rest);
  if (subcommand === 'push') return checkPush(rest, dir, context);
  return [];
}

function isNoVerify(arg: string): boolean {
  // git accepts any unambiguous prefix of a long option; `--no-veri` is the shortest.
  return arg.length >= '--no-veri'.length && '--no-verify'.startsWith(arg);
}

const COMMIT_LONG_OPTIONS_WITH_VALUES = new Set([
  '--message',
  '--file',
  '--reuse-message',
  '--reedit-message',
  '--template',
  '--author',
  '--date',
  '--fixup',
  '--squash',
  '--trailer',
  '--cleanup',
  '--pathspec-from-file',
]);
// Short commit options whose value follows, either in the same word or as the next word.
const COMMIT_SHORT_OPTIONS_WITH_VALUES = new Set(['m', 'F', 'C', 'c', 't']);
// Short commit options whose optional value can only be attached (`-uno`, `-S<keyid>`).
const COMMIT_SHORT_OPTIONS_WITH_ATTACHED_VALUES = new Set(['u', 'S']);

function checkCommit(args: readonly string[]): Finding[] {
  let noVerify = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--') break;
    if (arg.startsWith('--')) {
      if (isNoVerify(arg)) noVerify = true;
      else if (arg === '--verify') noVerify = false;
      else if (COMMIT_LONG_OPTIONS_WITH_VALUES.has(arg)) i += 1;
    } else if (arg.startsWith('-')) {
      for (let j = 1; j < arg.length; j += 1) {
        const flag = arg.charAt(j);
        if (flag === 'n') noVerify = true;
        if (COMMIT_SHORT_OPTIONS_WITH_ATTACHED_VALUES.has(flag)) break;
        if (COMMIT_SHORT_OPTIONS_WITH_VALUES.has(flag)) {
          if (j === arg.length - 1) i += 1;
          break;
        }
      }
    }
  }
  return noVerify ? [noVerifyFinding('git commit --no-verify', 'commit')] : [];
}

function noVerifyFinding(command: string, hookKind: string): Finding {
  return {
    rule: 'noVerify',
    message:
      `agent-guardrails blocked \`${command}\`: it skips the ${hookKind} hooks that catch problems before they land. ` +
      'Run it without --no-verify and fix whatever the hook reports. If a hook itself is broken, tell the user instead of skipping it.',
  };
}

const PUSH_LONG_OPTIONS_WITH_VALUES = new Set(['--repo', '--receive-pack', '--exec', '--push-option']);
const FORCE_OPTIONS = ['--force', '--force-with-lease', '--force-if-includes'];

function checkPush(args: readonly string[], dir: string | undefined, context: ShellContext): Finding[] {
  const findings: Finding[] = [];
  let force = false;
  let everyBranch = false;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--') {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const name = arg.split('=')[0] ?? arg;
      if (isNoVerify(name)) findings.push(noVerifyFinding('git push --no-verify', 'pre-push'));
      else if (FORCE_OPTIONS.includes(name)) force = true;
      else if (name === '--no-force-with-lease') force = false;
      else if (name === '--all' || name === '--branches' || name === '--mirror') everyBranch = true;
      else if (PUSH_LONG_OPTIONS_WITH_VALUES.has(arg)) i += 1;
    } else if (arg.startsWith('-') && arg.length > 1) {
      for (let j = 1; j < arg.length; j += 1) {
        const flag = arg.charAt(j);
        if (flag === 'f') force = true;
        if (flag === 'o') {
          if (j === arg.length - 1) i += 1;
          break;
        }
      }
    } else {
      positional.push(arg);
    }
  }

  const current = () => (dir === undefined ? undefined : context.currentBranch(dir));
  const isProtected = (branch: string | undefined) =>
    branch !== undefined && context.protectedBranches.includes(branch);
  const refspecs = positional.slice(1);
  const blocked = new Set<string>();

  if (force && everyBranch) {
    blocked.add('every branch');
  } else if (force && refspecs.length === 0) {
    // With no refspec git pushes the current branch, so that is the target.
    const branch = current();
    if (isProtected(branch)) blocked.add(`\`${branch ?? ''}\``);
  }
  for (const refspec of refspecs) {
    const plus = refspec.startsWith('+');
    const spec = plus ? refspec.slice(1) : refspec;
    const destination = spec.includes(':') ? spec.slice(spec.indexOf(':') + 1) : spec;
    const name = destination.replace(/^refs\/heads\//, '');
    const branch = name === 'HEAD' ? current() : name;
    if ((force || plus) && isProtected(branch)) blocked.add(`\`${branch ?? ''}\``);
  }

  for (const target of blocked) {
    findings.push({
      rule: 'forcePush',
      message:
        `agent-guardrails blocked a force push to ${target}: it rewrites history that other people build on. ` +
        'Push your work to a feature branch and open a pull request, or ask the user to run the force push themselves.',
    });
  }
  return findings;
}

function checkRm(args: readonly string[], cwd: string | undefined, context: ShellContext): Finding[] {
  let recursive = false;
  let optionsEnded = false;
  const targets: string[] = [];
  for (const arg of args) {
    if (optionsEnded || !arg.startsWith('-') || arg === '-') targets.push(arg);
    else if (arg === '--') optionsEnded = true;
    else if (arg === '--recursive') recursive = true;
    else if (!arg.startsWith('--') && /[rR]/.test(arg)) recursive = true;
  }
  if (!recursive) return [];

  const findings: Finding[] = [];
  for (const target of targets) {
    const reason = dangerousTarget(target, cwd, context);
    if (reason !== undefined) {
      findings.push({
        rule: 'recursiveRm',
        message:
          `agent-guardrails blocked \`rm -r ${target}\`: the target is ${reason}. ` +
          'Delete the specific files or folders you mean, by path, inside the project.',
      });
    }
  }
  return findings;
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

/** Why deleting `target` recursively would be a disaster, or undefined if it is not (AC-B4). */
function dangerousTarget(target: string, cwd: string | undefined, context: ShellContext): string | undefined {
  // `dir/*` and `dir/.*` empty `dir` just as thoroughly as deleting it.
  const withoutGlob = target.replace(/(^|\/)\.?\*$/, '$1') || '.';
  const expanded = expandHome(withoutGlob, context.home);
  if (expanded === undefined || /[*?[]/.test(expanded)) return undefined;
  if (!isAbsolute(expanded) && cwd === undefined) return undefined;

  const path = resolve(cwd ?? '/', expanded);
  if (path === resolve('/')) return 'the filesystem root';
  if (contains(path, context.home)) return path === context.home ? 'your home directory' : 'a folder that contains your home directory';

  const roots = [context.projectDir, context.repoRoot(cwd ?? context.cwd)];
  for (const root of roots) {
    if (root !== undefined && contains(path, root)) {
      return path === root ? 'the repository root' : 'a folder that contains the repository';
    }
  }
  return undefined;
}
