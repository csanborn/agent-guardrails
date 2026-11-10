// src/hooks/guard-edits.ts
import { readFileSync as readFileSync3 } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

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
function denyToolUse(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
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

// src/rules/bypass-comments.ts
import { extname } from "node:path";
var PYTHON = /* @__PURE__ */ new Set([".py", ".pyi"]);
var DIRECTIVES = [
  {
    label: "eslint-disable",
    pattern: /(?:\/\/|\/\*+|<!--)\s*eslint-disable(?:-next-line|-line)?(?![\w-])/g
  },
  { label: "@ts-ignore", pattern: /(?:\/\/|\/\*+|^\s*\*)\s*@ts-ignore\b/gm },
  { label: "@ts-nocheck", pattern: /(?:\/\/|\/\*+|^\s*\*)\s*@ts-nocheck\b/gm },
  {
    label: "@ts-expect-error without a reason",
    pattern: /(?:\/\/|\/\*+)\s*@ts-expect-error(?![\w-])[ \t:-]*(?:\*\/\}?)?[ \t]*$/gm
  },
  { label: "svelte-ignore", pattern: /(?:<!--|\/\/|\/\*+)\s*svelte-ignore\b/g },
  { label: "# noqa", pattern: /#\s*noqa\b/gi, extensions: PYTHON },
  { label: "# type: ignore", pattern: /#\s*type:\s*ignore\b/g, extensions: PYTHON }
];
var PROSE_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".mdx", ".markdown", ".txt", ".rst"]);
function isProseFile(filePath) {
  return PROSE_EXTENSIONS.has(extname(filePath).toLowerCase());
}
function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}
function addedBypasses(filePath, before, after) {
  if (isProseFile(filePath)) return [];
  const extension = extname(filePath).toLowerCase();
  return DIRECTIVES.filter(
    ({ pattern, extensions }) => (extensions === void 0 || extensions.has(extension)) && countMatches(after, pattern) > countMatches(before, pattern)
  ).map(({ label }) => label);
}
function bypassMessage(labels, filePath) {
  const list = labels.map((label) => `\`${label}\``).join(", ");
  return [
    `agent-guardrails blocked this edit to ${filePath}: it adds ${list}.`,
    "Fix the lint or type error the comment would hide instead of suppressing it.",
    "A `@ts-expect-error` with a short reason is allowed when a type gap is genuinely outside your control.",
    "If a suppression really is the right call, explain why to the user and let them add it."
  ].join(" ");
}

// src/hooks/guard-edits.ts
function readOrEmpty(path) {
  try {
    return readFileSync3(path, "utf8");
  } catch {
    return "";
  }
}
function beforeAndAfter(toolName, toolInput, filePath) {
  if (toolName === "Write") return [readOrEmpty(filePath), stringField(toolInput, "content") ?? ""];
  if (toolName === "Edit") {
    return [stringField(toolInput, "old_string") ?? "", stringField(toolInput, "new_string") ?? ""];
  }
  if (toolName === "MultiEdit") {
    const edits = Array.isArray(toolInput.edits) ? toolInput.edits.filter(isObject) : [];
    return [
      edits.map((edit) => stringField(edit, "old_string") ?? "").join("\n"),
      edits.map((edit) => stringField(edit, "new_string") ?? "").join("\n")
    ];
  }
  return void 0;
}
runHook((input) => {
  const toolName = stringField(input, "tool_name") ?? "";
  const toolInput = objectField(input, "tool_input");
  const filePath = stringField(toolInput, "file_path");
  if (filePath === void 0) return void 0;
  const dir = projectDir(input);
  if (!loadConfig(dir).bypassComments) return void 0;
  const texts = beforeAndAfter(toolName, toolInput, filePath);
  if (texts === void 0) return void 0;
  const labels = addedBypasses(filePath, ...texts);
  if (labels.length === 0) return void 0;
  const shown = relative(dir, resolve(dir, filePath));
  return denyToolUse(bypassMessage(labels, shown.startsWith("..") || isAbsolute(shown) ? filePath : shown));
});
