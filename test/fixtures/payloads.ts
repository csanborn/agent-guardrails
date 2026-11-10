// Hook payloads shaped like the ones Claude Code sends on stdin, per the hooks reference
// (common fields plus each event's own fields).

const common = (cwd: string, event: string) => ({
  session_id: 'a3c1e0f2-5b7d-4f0e-9a51-2f6d8c4b7e90',
  transcript_path: '/home/dev/.claude/projects/-work-app/a3c1e0f2.jsonl',
  cwd,
  permission_mode: 'default',
  hook_event_name: event,
});

export function preToolUse(cwd: string, toolName: string, toolInput: Record<string, unknown>) {
  return {
    ...common(cwd, 'PreToolUse'),
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: 'toolu_01ABCDEFGHJKMNPQRSTVWXYZ',
  };
}

export function postToolUse(cwd: string, toolName: string, toolInput: Record<string, unknown>) {
  return {
    ...common(cwd, 'PostToolUse'),
    tool_name: toolName,
    tool_input: toolInput,
    tool_response: { filePath: toolInput.file_path, success: true },
    tool_use_id: 'toolu_01ABCDEFGHJKMNPQRSTVWXYZ',
  };
}

export function stop(cwd: string, stopHookActive = false) {
  return {
    ...common(cwd, 'Stop'),
    stop_hook_active: stopHookActive,
    last_assistant_message: 'I have finished the change.',
    background_tasks: [],
    session_crons: [],
  };
}

export function sessionEnd(cwd: string) {
  return { ...common(cwd, 'SessionEnd'), reason: 'prompt_input_exit' };
}

export const editInput = (filePath: string, oldString: string, newString: string) => ({
  file_path: filePath,
  old_string: oldString,
  new_string: newString,
  replace_all: false,
});

export const writeInput = (filePath: string, content: string) => ({ file_path: filePath, content });

export const bashInput = (command: string) => ({
  command,
  description: 'Run a command',
  timeout: 120000,
  run_in_background: false,
});
