import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { loadConfig, projectDir } from '../config.js';
import { objectField, runHook, stringField, type JsonObject } from '../hook-io.js';
import { classifyFile, parseState, recordEdit, reminderFor, type SessionState } from '../rules/test-reminder.js';

// One small JSON file per session. CLAUDE_PLUGIN_DATA is the plugin's own persistent
// data folder when Claude Code runs the hook; the temp folder covers manual runs.
function stateFile(sessionId: string): string {
  const base = process.env.CLAUDE_PLUGIN_DATA ?? join(tmpdir(), 'agent-guardrails');
  return join(base, 'sessions', `${sessionId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
}

function readState(file: string): SessionState {
  try {
    return parseState(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return parseState(undefined);
  }
}

function writeState(file: string, state: SessionState): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state));
}

function recordToolUse(input: JsonObject, file: string, dir: string): void {
  const filePath = stringField(objectField(input, 'tool_input'), 'file_path');
  if (filePath === undefined) return;
  const path = relative(dir, resolve(dir, filePath));
  if (path === '' || path.startsWith('..') || isAbsolute(path)) return;
  const portable = path.split(sep).join('/');
  const kind = classifyFile(portable);
  if (kind === 'other') return;
  const state = readState(file);
  const next = recordEdit(state, kind, portable);
  if (next !== state) writeState(file, next);
}

runHook((input) => {
  const sessionId = stringField(input, 'session_id');
  if (sessionId === undefined) return undefined;
  const file = stateFile(sessionId);
  const event = stringField(input, 'hook_event_name');

  if (event === 'SessionEnd') {
    rmSync(file, { force: true });
    return undefined;
  }

  const dir = projectDir(input);
  if (!loadConfig(dir).testReminder) return undefined;

  if (event === 'PostToolUse') {
    recordToolUse(input, file, dir);
    return undefined;
  }
  if (event !== 'Stop' || input.stop_hook_active === true) return undefined;

  const state = readState(file);
  const reminder = reminderFor(state);
  if (reminder === undefined) return undefined;
  writeState(file, { ...state, reminded: true });
  return { hookSpecificOutput: { hookEventName: 'Stop', additionalContext: reminder } };
});
