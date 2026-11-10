import { readFileSync } from 'node:fs';

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringField(object: JsonObject, key: string): string | undefined {
  const value = object[key];
  return typeof value === 'string' ? value : undefined;
}

export function objectField(object: JsonObject, key: string): JsonObject {
  const value = object[key];
  return isObject(value) ? value : {};
}

/** The PreToolUse JSON that denies a tool call and tells Claude why (AC-E8, AC-B8). */
export function denyToolUse(reason: string): JsonObject {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

/**
 * Reads the hook payload from stdin, runs the handler and prints its JSON answer.
 * Any parse error or exception exits 0 with no output (AC-H2): a guard that crashes
 * must let the agent keep working rather than wedge the session.
 */
export function runHook(handler: (input: JsonObject) => JsonObject | undefined): void {
  try {
    const input: unknown = JSON.parse(readFileSync(0, 'utf8'));
    if (!isObject(input)) return;
    const output = handler(input);
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    // Fail open, as described above.
  }
}
