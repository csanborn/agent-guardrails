// src/hooks/test-reminder.ts
import { mkdirSync, readFileSync as readFileSync3, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join as join2, relative, resolve, sep } from "node:path";

// src/config.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { join } from "node:path";

// src/hook-io.ts
import { readFileSync } from "node:fs";
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringField(object, key) {
  const value = object[key];
  return typeof value === "string" ? value : void 0;
}
function objectField(object, key) {
  const value = object[key];
  return isObject(value) ? value : {};
}
function runHook(handler) {
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    if (!isObject(input)) return;
    const output = handler(input);
    if (output) process.stdout.write(`${JSON.stringify(output)}
`);
  } catch {
  }
}

// src/config.ts
var CONFIG_FILE = ".agent-guardrails.json";
var DEFAULT_CONFIG = {
  bypassComments: true,
  noVerify: true,
  forcePush: true,
  recursiveRm: true,
  testReminder: true,
  protectedBranches: ["main", "master"]
};
var RULE_NAMES = [
  "bypassComments",
  "noVerify",
  "forcePush",
  "recursiveRm",
  "testReminder"
];
function parseConfig(text) {
  if (text === void 0) return DEFAULT_CONFIG;
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return DEFAULT_CONFIG;
  }
  if (!isObject(raw)) return DEFAULT_CONFIG;
  const config = { ...DEFAULT_CONFIG };
  for (const rule of RULE_NAMES) {
    const value = raw[rule];
    if (typeof value === "boolean") config[rule] = value;
  }
  const branches = raw.protectedBranches;
  if (Array.isArray(branches) && branches.every((branch) => typeof branch === "string")) {
    config.protectedBranches = branches;
  }
  return config;
}
function projectDir(input) {
  return process.env.CLAUDE_PROJECT_DIR ?? stringField(input, "cwd") ?? process.cwd();
}
function loadConfig(dir) {
  let text;
  try {
    text = readFileSync2(join(dir, CONFIG_FILE), "utf8");
  } catch {
    text = void 0;
  }
  return parseConfig(text);
}

// src/rules/test-reminder.ts
import { basename, extname } from "node:path";
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".svelte",
  ".vue",
  ".astro",
  ".py",
  ".go",
  ".rb",
  ".java",
  ".kt",
  ".scala",
  ".rs",
  ".cs",
  ".swift",
  ".php",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".ex",
  ".exs",
  ".dart"
]);
var TEST_DIRECTORIES = /* @__PURE__ */ new Set(["test", "tests", "__tests__", "spec", "specs", "e2e"]);
var TEST_FILE_NAMES = [
  /\.(test|spec)\.[^.]+$/,
  /_(test|spec)\.[^.]+$/,
  /^test_.+\.py$/,
  /(Test|Tests|Spec)\.(java|kt|scala|cs|swift)$/
];
function classifyFile(relativePath) {
  const segments = relativePath.split("/");
  const name = basename(relativePath);
  if (segments.slice(0, -1).some((segment) => TEST_DIRECTORIES.has(segment))) return "test";
  if (TEST_FILE_NAMES.some((pattern) => pattern.test(name))) return "test";
  if (name.startsWith(".") || name.endsWith(".d.ts") || /\.config\.[^.]+$/.test(name)) return "other";
  return SOURCE_EXTENSIONS.has(extname(name)) ? "source" : "other";
}
var EMPTY_STATE = { sources: [], tests: [], reminded: false };
function recordEdit(state, kind, path) {
  if (kind === "test" && !state.tests.includes(path)) {
    return { ...state, tests: [...state.tests, path] };
  }
  if (kind === "source" && !state.sources.includes(path)) {
    return { ...state, sources: [...state.sources, path], reminded: false };
  }
  return state;
}
var LISTED_FILES = 5;
function reminderFor(state) {
  if (state.reminded || state.tests.length > 0 || state.sources.length === 0) return void 0;
  const shown = state.sources.slice(0, LISTED_FILES).join(", ");
  const more = state.sources.length > LISTED_FILES ? ` and ${String(state.sources.length - LISTED_FILES)} more` : "";
  const count = state.sources.length === 1 ? "1 source file" : `${String(state.sources.length)} source files`;
  return [
    `agent-guardrails: this session changed ${count} (${shown}${more}) and no test files.`,
    "Add or update tests that cover the change and run them.",
    "If tests genuinely do not apply, say why in one line. This reminder is sent once."
  ].join(" ");
}
function parseState(value) {
  if (typeof value !== "object" || value === null) return EMPTY_STATE;
  const { sources, tests, reminded } = value;
  const strings = (list) => Array.isArray(list) ? list.filter((item) => typeof item === "string") : [];
  return { sources: strings(sources), tests: strings(tests), reminded: reminded === true };
}

// src/hooks/test-reminder.ts
function stateFile(sessionId) {
  const base = process.env.CLAUDE_PLUGIN_DATA ?? join2(tmpdir(), "agent-guardrails");
  return join2(base, "sessions", `${sessionId.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
}
function readState(file) {
  try {
    return parseState(JSON.parse(readFileSync3(file, "utf8")));
  } catch {
    return parseState(void 0);
  }
}
function writeState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state));
}
function recordToolUse(input, file, dir) {
  const filePath = stringField(objectField(input, "tool_input"), "file_path");
  if (filePath === void 0) return;
  const path = relative(dir, resolve(dir, filePath));
  if (path === "" || path.startsWith("..") || isAbsolute(path)) return;
  const portable = path.split(sep).join("/");
  const kind = classifyFile(portable);
  if (kind === "other") return;
  const state = readState(file);
  const next = recordEdit(state, kind, portable);
  if (next !== state) writeState(file, next);
}
runHook((input) => {
  const sessionId = stringField(input, "session_id");
  if (sessionId === void 0) return void 0;
  const file = stateFile(sessionId);
  const event = stringField(input, "hook_event_name");
  if (event === "SessionEnd") {
    rmSync(file, { force: true });
    return void 0;
  }
  const dir = projectDir(input);
  if (!loadConfig(dir).testReminder) return void 0;
  if (event === "PostToolUse") {
    recordToolUse(input, file, dir);
    return void 0;
  }
  if (event !== "Stop" || input.stop_hook_active === true) return void 0;
  const state = readState(file);
  const reminder = reminderFor(state);
  if (reminder === void 0) return void 0;
  writeState(file, { ...state, reminded: true });
  return { hookSpecificOutput: { hookEventName: "Stop", additionalContext: reminder } };
});
