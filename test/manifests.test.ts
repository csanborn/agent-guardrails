// Checks the plugin, marketplace and hooks files against the shapes documented at
// https://code.claude.com/docs/en/plugins/manifest-reference and
// https://code.claude.com/docs/en/plugins/marketplace-reference.
// `claude plugin validate .` is the authoritative check; this keeps CI honest without it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isObject, type JsonObject } from '../src/hook-io.js';

const ROOT = join(import.meta.dirname, '..');

function readJson(path: string): JsonObject {
  const value: unknown = JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
  if (!isObject(value)) throw new Error(`${path} is not a JSON object`);
  return value;
}

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_PART = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RESERVED_PREFIX = /^(claude|anthropic|anthropics|cc-plugin)-/;

const plugin = readJson('.claude-plugin/plugin.json');
const marketplace = readJson('.claude-plugin/marketplace.json');
const hooksFile = readJson('hooks/hooks.json');

describe('.claude-plugin/plugin.json', () => {
  it('AC-P1 has a valid kebab-case name that does not pass as an Anthropic plugin', () => {
    expect(plugin.name).toMatch(KEBAB_CASE);
    expect(plugin.name).not.toMatch(RESERVED_PREFIX);
  });

  it('AC-P1 carries the metadata the validator warns about when missing', () => {
    expect(typeof plugin.version).toBe('string');
    expect(typeof plugin.description).toBe('string');
    expect(isObject(plugin.author) && typeof plugin.author.name === 'string').toBe(true);
    expect(plugin.license).toBe('MIT');
    expect(() => new URL(String(plugin.homepage))).not.toThrow();
  });

  it('AC-P1 uses only documented top-level keys', () => {
    const known = ['name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords'];
    expect(Object.keys(plugin).filter((key) => !known.includes(key))).toEqual([]);
  });

  it('matches the version in package.json', () => {
    expect(plugin.version).toBe(readJson('package.json').version);
  });
});

describe('.claude-plugin/marketplace.json', () => {
  it('AC-P1 has the required name, owner and plugins', () => {
    expect(marketplace.name).toMatch(ID_PART);
    expect(String(marketplace.name)).not.toContain('..');
    expect(isObject(marketplace.owner) && typeof marketplace.owner.name === 'string').toBe(true);
    expect(Array.isArray(marketplace.plugins) && marketplace.plugins.length > 0).toBe(true);
    expect(typeof marketplace.description).toBe('string');
  });

  it('AC-P2 lists this plugin under the name in plugin.json, from a relative source inside the repo', () => {
    const entries = (marketplace.plugins as unknown[]).filter(isObject);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry?.name).toBe(plugin.name);
    expect(entry?.name).toMatch(ID_PART);
    const source = String(entry?.source);
    expect(source === '.' || source.startsWith('./')).toBe(true);
    expect(source).not.toContain('..');
    expect(existsSync(join(ROOT, source, '.claude-plugin', 'plugin.json'))).toBe(true);
  });
});

describe('hooks/hooks.json', () => {
  const events = isObject(hooksFile.hooks) ? hooksFile.hooks : {};

  it('AC-P1 wraps the event map in a top-level hooks key', () => {
    expect(Object.keys(events).sort()).toEqual(['PostToolUse', 'PreToolUse', 'SessionEnd', 'Stop']);
  });

  const handlers = Object.entries(events).flatMap(([event, groups]) =>
    (Array.isArray(groups) ? groups.filter(isObject) : []).flatMap((group) =>
      (Array.isArray(group.hooks) ? group.hooks.filter(isObject) : []).map((handler) => ({ event, group, handler })),
    ),
  );

  it.each(handlers.map(({ event, handler }) => [event, String(handler.command), handler] as const))(
    'AC-H1 %s runs %s from a committed dist file',
    (_event, command, handler) => {
      expect(handler.type).toBe('command');
      expect(typeof handler.timeout).toBe('number');
      const match = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/(dist\/[\w-]+\.mjs)"$/.exec(command);
      expect(match).not.toBeNull();
      expect(existsSync(join(ROOT, match?.[1] ?? ''))).toBe(true);
    },
  );

  it('matches tool events only on the tools each hook understands', () => {
    const matchers = handlers.map(({ event, group }) => [event, group.matcher]);
    expect(matchers).toEqual([
      ['PreToolUse', 'Edit|Write|MultiEdit'],
      ['PreToolUse', 'Bash'],
      ['PostToolUse', 'Edit|Write|MultiEdit'],
      ['Stop', undefined],
      ['SessionEnd', undefined],
    ]);
  });
});

describe('skills', () => {
  const skills = readdirSync(join(ROOT, 'skills'));

  it('ships spec-first and pr-ready', () => {
    expect(skills.sort()).toEqual(['pr-ready', 'spec-first']);
  });

  it.each(skills)('AC-S3 %s has a name and a trigger description in its frontmatter', (skill) => {
    const text = readFileSync(join(ROOT, 'skills', skill, 'SKILL.md'), 'utf8');
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
    expect(/^name: (.+)$/m.exec(frontmatter)?.[1]).toBe(skill);
    const description = /^description: (.+)$/m.exec(frontmatter)?.[1] ?? '';
    expect(description).toMatch(/Use when/);
    expect(description.length).toBeLessThanOrEqual(1536);
  });
});
