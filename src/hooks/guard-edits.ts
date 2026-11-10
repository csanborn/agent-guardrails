import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { loadConfig, projectDir } from '../config.js';
import { denyToolUse, isObject, objectField, runHook, stringField, type JsonObject } from '../hook-io.js';
import { addedBypasses, bypassMessage } from '../rules/bypass-comments.js';

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/** The text a tool call replaces and the text it writes, so only additions are judged (AC-E6). */
function beforeAndAfter(toolName: string, toolInput: JsonObject, filePath: string): [string, string] | undefined {
  if (toolName === 'Write') return [readOrEmpty(filePath), stringField(toolInput, 'content') ?? ''];
  if (toolName === 'Edit') {
    return [stringField(toolInput, 'old_string') ?? '', stringField(toolInput, 'new_string') ?? ''];
  }
  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(toolInput.edits) ? toolInput.edits.filter(isObject) : [];
    return [
      edits.map((edit) => stringField(edit, 'old_string') ?? '').join('\n'),
      edits.map((edit) => stringField(edit, 'new_string') ?? '').join('\n'),
    ];
  }
  return undefined;
}

runHook((input) => {
  const toolName = stringField(input, 'tool_name') ?? '';
  const toolInput = objectField(input, 'tool_input');
  const filePath = stringField(toolInput, 'file_path');
  if (filePath === undefined) return undefined;

  const dir = projectDir(input);
  if (!loadConfig(dir).bypassComments) return undefined;

  const texts = beforeAndAfter(toolName, toolInput, filePath);
  if (texts === undefined) return undefined;
  const labels = addedBypasses(filePath, ...texts);
  if (labels.length === 0) return undefined;

  const shown = relative(dir, resolve(dir, filePath));
  return denyToolUse(bypassMessage(labels, shown.startsWith('..') || isAbsolute(shown) ? filePath : shown));
});
