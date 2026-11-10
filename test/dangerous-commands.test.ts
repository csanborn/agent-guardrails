import { describe, expect, it } from 'vitest';
import { checkCommand, type Finding, type ShellContext } from '../src/rules/dangerous-commands.js';

function context(overrides: Partial<ShellContext> = {}): ShellContext {
  return {
    cwd: '/work/app',
    home: '/home/dev',
    projectDir: '/work/app',
    protectedBranches: ['main', 'master'],
    repoRoot: (dir) => (dir === '/work/app' || dir.startsWith('/work/app/') ? '/work/app' : undefined),
    currentBranch: () => 'feature/login',
    ...overrides,
  };
}

const onMain = context({ currentBranch: () => 'main' });
const rules = (findings: Finding[]) => findings.map((finding) => finding.rule);

describe('checkCommand blocks', () => {
  it.each<[string, string, ShellContext?]>([
    ['AC-B1', 'git commit --no-verify -m "wip"'],
    ['AC-B1', 'git commit -n -m wip'],
    ['AC-B1', 'git commit -nm wip'],
    ['AC-B1', 'git commit -anm wip'],
    ['AC-B1', 'git commit --no-veri -m wip'],
    ['AC-B1', 'git commit -m wip --no-verify'],
    ['AC-B1', 'git push --no-verify origin feature/login'],
    ['AC-B6', 'git add . && git commit --no-verify -m "wip"'],
    ['AC-B6', 'npm test; git commit -n -m wip'],
    ['AC-B6', 'echo $(git commit --no-verify -m wip)'],
    ['AC-B6', 'bash -c "git commit --no-verify -m wip"'],
    ['AC-B6', "sh -lc 'git commit -n -m wip'"],
    ['AC-B7', 'HUSKY_SKIP=1 git commit --no-verify -m wip'],
    ['AC-B7', 'git -C packages/api commit --no-verify -m wip'],
    ['AC-B7', 'git -c core.hooksPath=/dev/null commit -n -m wip'],
    ['AC-B7', 'env GIT_AUTHOR_NAME=bot git commit --no-verify'],
  ])('%s noVerify: %s', (_id, command) => {
    expect(rules(checkCommand(command, context()))).toContain('noVerify');
  });

  it.each<[string, string, ShellContext?]>([
    ['AC-B2', 'git push --force origin main'],
    ['AC-B2', 'git push -f origin master'],
    ['AC-B2', 'git push -uf origin main'],
    ['AC-B2', 'git push origin +main'],
    ['AC-B2', 'git push --force-with-lease origin HEAD:main'],
    ['AC-B2', 'git push --force-with-lease=main:abc123 origin main'],
    ['AC-B2', 'git push -f origin refs/heads/main'],
    ['AC-B2', 'git push -f origin feature/login:main'],
    ['AC-B2', 'git push --force --all origin'],
    ['AC-B2', 'git push --force --mirror backup'],
    ['AC-B2', 'git push -f', onMain],
    ['AC-B2', 'git push --force origin', onMain],
    ['AC-B2', 'git push --force origin HEAD', onMain],
    ['AC-B6', '(cd app && git push -f origin main)'],
    ['AC-B6', 'zsh -c "git push --force origin main"'],
    ['AC-B7', 'sudo -u deploy git push -f origin main'],
    ['AC-B7', 'git -C ../other push --force origin main'],
  ])('%s forcePush: %s', (_id, command, ctx) => {
    expect(rules(checkCommand(command, ctx ?? context()))).toContain('forcePush');
  });

  it('AC-B2 honors a custom protected branch list', () => {
    const ctx = context({ protectedBranches: ['develop'] });
    expect(rules(checkCommand('git push -f origin develop', ctx))).toEqual(['forcePush']);
    expect(checkCommand('git push -f origin main', ctx)).toEqual([]);
  });

  it.each<[string, string, ShellContext?]>([
    ['AC-B4', 'rm -rf /'],
    ['AC-B4', 'rm -rf /*'],
    ['AC-B4', 'rm -rf ~'],
    ['AC-B4', 'rm -rf ~/'],
    ['AC-B4', 'rm -rf ~/*'],
    ['AC-B4', 'rm -rf $HOME'],
    ['AC-B4', 'rm -rf "${HOME}"'],
    ['AC-B4', 'rm -rf "$HOME"/*'],
    ['AC-B4', 'rm -rf /home'],
    ['AC-B4', 'rm -fr .'],
    ['AC-B4', 'rm -r -f ./'],
    ['AC-B4', 'rm -rf *'],
    ['AC-B4', 'rm -R .'],
    ['AC-B4', 'rm --recursive --force /work/app'],
    ['AC-B4', 'rm -rf /work'],
    ['AC-B4', 'rm -rf ..'],
    ['AC-B4', 'rm -rf -- ~'],
    ['AC-B4', 'rm -rf node_modules /'],
    ['AC-B6', 'cd src && rm -rf ..'],
    ['AC-B6', 'cd ~ && rm -rf *'],
    ['AC-B6', 'cd && rm -rf .'],
    ['AC-B7', 'sudo rm -rf /'],
    ['AC-B7', 'command rm -rf ~'],
  ])('%s recursiveRm: %s', (_id, command, ctx) => {
    expect(rules(checkCommand(command, ctx ?? context()))).toContain('recursiveRm');
  });

  it('AC-B4 blocks the root of another repository the chain moves into', () => {
    const ctx = context({ repoRoot: (dir) => (dir.startsWith('/work/other') ? '/work/other' : undefined) });
    expect(rules(checkCommand('cd /work/other && rm -rf .', ctx))).toEqual(['recursiveRm']);
  });

  it('AC-B8 explains what was blocked and what to do instead', () => {
    const [push] = checkCommand('git push -f origin main', context());
    expect(push?.message).toMatch(/force push to `main`.*feature branch/);
    const [rm] = checkCommand('rm -rf ~', context());
    expect(rm?.message).toMatch(/home directory.*specific files/);
    const [commit] = checkCommand('git commit -n -m x', context());
    expect(commit?.message).toMatch(/without --no-verify/);
  });
});

describe('checkCommand allows', () => {
  it.each<[string, string, ShellContext?]>([
    ['AC-B3', 'npm test'],
    ['AC-B3', 'git status && git diff --stat'],
    ['AC-B3', 'git push origin main'],
    ['AC-B3', 'git push -u origin feature/login'],
    ['AC-B3', 'git push --force origin feature/login'],
    ['AC-B3', 'git push --force-with-lease'],
    ['AC-B3', 'git push -f'],
    ['AC-B3', 'git push --force origin HEAD'],
    ['AC-B3', 'git push -n origin main'],
    ['AC-B3', 'git push -o ci.skip origin main'],
    ['AC-B3', 'git push origin', onMain],
    ['AC-B3', 'git push origin :main'],
    ['AC-B1', 'git commit -m "wip"'],
    ['AC-B1', 'git commit --no-verify --verify -m wip'],
    ['AC-B1', 'git commit -m -n'],
    ['AC-B1', 'git commit --amend --no-edit'],
    ['AC-B1', 'git log -n 5'],
    ['AC-B5', 'echo "git push --force origin main"'],
    ['AC-B5', "git commit -m 'skip -n later'"],
    ['AC-B5', 'git commit -m "mention --no-verify in the message"'],
    ['AC-B5', 'grep -rn "rm -rf /" src'],
    ['AC-B5', '# git push --force origin main'],
    ['AC-B4', 'rm -rf node_modules dist coverage'],
    ['AC-B4', 'rm -rf ./build/*'],
    ['AC-B4', 'rm -rf /tmp/scratch'],
    ['AC-B4', 'rm -rf ~/.cache/vitest'],
    ['AC-B4', 'rm ~/notes.txt'],
    ['AC-B4', 'rm -f *.log'],
    ['AC-B4', 'cd src && rm -rf generated'],
    ['AC-B4', 'cd "$BUILD_DIR" && rm -rf .'],
    ['AC-B4', 'cd - && rm -rf .'],
    ['AC-B4', 'rm -rf "$OUT_DIR"'],
    ['AC-B4', 'rm -rf src/*.tmp'],
  ])('%s %s', (_id, command, ctx) => {
    expect(checkCommand(command, ctx ?? context())).toEqual([]);
  });

  it('only asks git for the current branch when no refspec names the target', () => {
    let calls = 0;
    const ctx = context({
      currentBranch: () => {
        calls += 1;
        return 'main';
      },
    });
    checkCommand('git push -f origin feature/login', ctx);
    expect(calls).toBe(0);
  });
});
