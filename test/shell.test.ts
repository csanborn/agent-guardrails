import { describe, expect, it } from 'vitest';
import { splitCommands } from '../src/rules/shell.js';

describe('splitCommands', () => {
  it.each<[string, string[][]]>([
    ['git status', [['git', 'status']]],
    ['npm run lint && npm test', [['npm', 'run', 'lint'], ['npm', 'test']]],
    ['a; b || c | d & e', [['a'], ['b'], ['c'], ['d'], ['e']]],
    ['echo "git push --force"', [['echo', 'git push --force']]],
    ["echo 'rm -rf /'", [['echo', 'rm -rf /']]],
    ['git commit -m "say \\"hi\\""', [['git', 'commit', '-m', 'say "hi"']]],
    ['echo a\\ b', [['echo', 'a b']]],
    ['echo "a"\'b\'c', [['echo', 'abc']]],
    ['ls # rm -rf /', [['ls']]],
    ['(cd app && make)', [['cd', 'app'], ['make']]],
    ['echo $(git rev-parse HEAD)', [['echo'], ['git', 'rev-parse', 'HEAD']]],
    ['npm test 2>&1 > out.log', [['npm', 'test']]],
    ['cat < input.txt', [['cat']]],
    ['line one\nline two', [['line', 'one'], ['line', 'two']]],
    ['git commit \\\n  -m x', [['git', 'commit', '-m', 'x']]],
    ['', []],
  ])('splits %j', (script, expected) => {
    expect(splitCommands(script)).toEqual(expected);
  });
});
