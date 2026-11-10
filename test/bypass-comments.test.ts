import { describe, expect, it } from 'vitest';
import { addedBypasses, bypassMessage } from '../src/rules/bypass-comments.js';

describe('addedBypasses', () => {
  it.each([
    ['AC-E1', 'src/app.ts', '// eslint-disable-next-line no-console\nconsole.log(x);', 'eslint-disable'],
    ['AC-E1', 'src/app.js', 'const a = 1; // eslint-disable-line', 'eslint-disable'],
    ['AC-E1', 'src/index.ts', '/* eslint-disable */\nexport {};', 'eslint-disable'],
    ['AC-E1', 'src/any.ts', '/* eslint-disable @typescript-eslint/no-explicit-any */', 'eslint-disable'],
    ['AC-E1', 'src/Page.tsx', '{/* eslint-disable-next-line react/no-danger */}', 'eslint-disable'],
    ['AC-E1', 'src/Card.vue', '<!-- eslint-disable vue/no-v-html -->', 'eslint-disable'],
    ['AC-E2', 'src/app.ts', '// @ts-ignore\nfoo(bar);', '@ts-ignore'],
    ['AC-E2', 'src/app.ts', '/** @ts-ignore */', '@ts-ignore'],
    ['AC-E2', 'src/legacy.js', '// @ts-nocheck\nimport x from "y";', '@ts-nocheck'],
    ['AC-E3', 'src/Menu.svelte', '<!-- svelte-ignore a11y_click_events_have_key_events -->', 'svelte-ignore'],
    ['AC-E3', 'src/Menu.svelte', '// svelte-ignore state_referenced_locally', 'svelte-ignore'],
    ['AC-E4', 'app/main.py', 'import os  # noqa: F401', '# noqa'],
    ['AC-E4', 'app/main.py', 'x = y  # NOQA', '# noqa'],
    ['AC-E4', 'app/types.pyi', 'value = cast(x)  # type: ignore[arg-type]', '# type: ignore'],
    ['AC-E5', 'src/app.ts', '// @ts-expect-error\nfoo(bar);', '@ts-expect-error without a reason'],
    ['AC-E5', 'src/app.ts', '/* @ts-expect-error */', '@ts-expect-error without a reason'],
    ['AC-E5', 'src/app.ts', '// @ts-expect-error: \n', '@ts-expect-error without a reason'],
  ])('%s blocks an added bypass in %s: %j', (_id, path, after, label) => {
    expect(addedBypasses(path, '', after)).toEqual([label]);
  });

  it.each([
    ['AC-E5', 'src/app.ts', '// @ts-expect-error the SDK types omit the beta field\nclient.beta;'],
    ['AC-E5', 'src/app.ts', '// @ts-expect-error: upstream issue #123'],
    ['AC-E5', 'src/app.ts', '/* @ts-expect-error legacy global, removed in v3 */'],
    ['AC-E1', 'src/app.ts', '// eslint-enable no-console'],
    ['AC-E1', 'src/app.ts', 'const rule = "eslint-disable";'],
    ['AC-E1', 'src/app.ts', 'Do not use eslint-disable comments.'],
    ['AC-E2', 'src/app.ts', 'const tsIgnoreCount = 0;'],
    ['AC-E4', 'src/app.ts', "const label = '# noqa';"],
    ['AC-E4', 'app/main.py', 'color = "#noqa1"  # brand color'],
    ['AC-E4', 'app/main.py', 'url = "https://example.com/#type"'],
    ['AC-E7', 'README.md', 'Never add `// eslint-disable` or `# noqa` comments.'],
    ['AC-E7', 'docs/guide.MDX', '// @ts-ignore'],
    ['AC-E7', 'notes.txt', '// @ts-nocheck'],
    ['AC-E7', 'index.rst', '# type: ignore'],
  ])('%s allows in %s: %j', (_id, path, after) => {
    expect(addedBypasses(path, '', after)).toEqual([]);
  });

  it('AC-E6 ignores a directive the edit keeps from the old text', () => {
    const before = '// eslint-disable-next-line no-console\nconsole.log(a);';
    const after = '// eslint-disable-next-line no-console\nconsole.log(a, b);';
    expect(addedBypasses('src/app.ts', before, after)).toEqual([]);
  });

  it('AC-E6 still blocks a second directive added next to an existing one', () => {
    const before = '// @ts-ignore\na();';
    const after = '// @ts-ignore\na();\n// @ts-ignore\nb();';
    expect(addedBypasses('src/app.ts', before, after)).toEqual(['@ts-ignore']);
  });

  it('AC-E6 allows an edit that removes a directive', () => {
    expect(addedBypasses('src/app.ts', '// @ts-ignore\na();', 'a();')).toEqual([]);
  });

  it('reports every kind of directive an edit adds', () => {
    expect(addedBypasses('src/app.ts', '', '// @ts-ignore\n// eslint-disable-line')).toEqual([
      'eslint-disable',
      '@ts-ignore',
    ]);
  });
});

describe('bypassMessage', () => {
  it('AC-E8 names the directive and the file and asks for a real fix', () => {
    const message = bypassMessage(['@ts-ignore'], 'src/app.ts');
    expect(message).toContain('`@ts-ignore`');
    expect(message).toContain('src/app.ts');
    expect(message).toMatch(/Fix the lint or type error/);
  });
});
