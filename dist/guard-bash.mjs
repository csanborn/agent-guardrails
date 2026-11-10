// src/hooks/guard-bash.ts
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

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

// src/rules/dangerous-commands.ts
import { basename, isAbsolute, relative, resolve } from "node:path";

// src/rules/shell.ts
var COMMAND_SEPARATORS = /* @__PURE__ */ new Set([";", "&", "|", "\n", "(", ")", "`"]);
var WORD_BREAKS = /* @__PURE__ */ new Set([" ", "	", "\r"]);
function splitCommands(script) {
  const commands = [];
  let words = [];
  let word = "";
  let inWord = false;
  let skipNextWord = false;
  const endWord = () => {
    if (inWord) {
      if (skipNextWord) skipNextWord = false;
      else words.push(word);
    }
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
    skipNextWord = false;
  };
  let i = 0;
  while (i < script.length) {
    const char = script.charAt(i);
    if (char === "'") {
      const close = script.indexOf("'", i + 1);
      const end = close === -1 ? script.length : close;
      word += script.slice(i + 1, end);
      inWord = true;
      i = end + 1;
      continue;
    }
    if (char === '"') {
      inWord = true;
      i += 1;
      while (i < script.length && script.charAt(i) !== '"') {
        const inner = script.charAt(i);
        const next = script.charAt(i + 1);
        if (inner === "\\" && ['"', "\\", "$", "`"].includes(next)) {
          word += next;
          i += 2;
        } else {
          word += inner;
          i += 1;
        }
      }
      i += 1;
      continue;
    }
    if (char === "\\") {
      const next = script.charAt(i + 1);
      if (next !== "\n") {
        word += next;
        inWord = true;
      }
      i += 2;
      continue;
    }
    if (char === "#" && !inWord) {
      const newline = script.indexOf("\n", i);
      i = newline === -1 ? script.length : newline;
      continue;
    }
    if (char === "$" && script.charAt(i + 1) === "(") {
      endCommand();
      i += 2;
      continue;
    }
    if (char === ">" || char === "<") {
      if (/^\d+$/.test(word)) {
        word = "";
        inWord = false;
      }
      endWord();
      i += 1;
      while (i < script.length && "<>&|".includes(script.charAt(i))) i += 1;
      skipNextWord = true;
      continue;
    }
    if (COMMAND_SEPARATORS.has(char)) {
      endCommand();
      i += 1;
      continue;
    }
    if (WORD_BREAKS.has(char)) {
      endWord();
      i += 1;
      continue;
    }
    word += char;
    inWord = true;
    i += 1;
  }
  endCommand();
  return commands;
}

// src/rules/dangerous-commands.ts
var MAX_NESTED_SHELLS = 3;
var SHELLS = /* @__PURE__ */ new Set(["sh", "bash", "zsh", "dash", "ksh"]);
function checkCommand(script, context) {
  return checkScript(script, context, context.cwd, 0);
}
function checkScript(script, context, startDir, depth) {
  const findings = [];
  let cwd = startDir;
  for (const raw of splitCommands(script)) {
    const words = unwrap(raw);
    const program = words[0] === void 0 ? "" : basename(words[0]);
    const args = words.slice(1);
    if (program === "cd") {
      const target = args.find((arg) => arg === "-" || !arg.startsWith("-"));
      const expanded = target === "-" ? void 0 : expandHome(target ?? "~", context.home);
      if (expanded === void 0) cwd = void 0;
      else if (isAbsolute(expanded)) cwd = expanded;
      else if (cwd !== void 0) cwd = resolve(cwd, expanded);
    } else if (SHELLS.has(program) && depth < MAX_NESTED_SHELLS) {
      const inner = shellScriptArgument(args);
      if (inner !== void 0) findings.push(...checkScript(inner, context, cwd, depth + 1));
    } else if (program === "git") {
      findings.push(...checkGit(args, cwd, context));
    } else if (program === "rm") {
      findings.push(...checkRm(args, cwd, context));
    }
  }
  return findings;
}
var ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
var WRAPPER_OPTIONS_WITH_VALUES = /* @__PURE__ */ new Map([
  ["sudo", /* @__PURE__ */ new Set(["-u", "-g", "-h", "-p", "-C", "-D", "-r", "-t", "-U"])],
  ["env", /* @__PURE__ */ new Set(["-u", "-C", "-S"])],
  ["exec", /* @__PURE__ */ new Set(["-a"])],
  ["command", /* @__PURE__ */ new Set()],
  ["nohup", /* @__PURE__ */ new Set()],
  ["time", /* @__PURE__ */ new Set(["-f", "-o"])]
]);
function unwrap(words) {
  let rest = words;
  for (; ; ) {
    while (rest[0] !== void 0 && ASSIGNMENT.test(rest[0])) rest = rest.slice(1);
    const head = rest[0];
    if (head === void 0) return rest;
    const valued = WRAPPER_OPTIONS_WITH_VALUES.get(basename(head));
    if (valued === void 0) return rest;
    let i = 1;
    while (i < rest.length) {
      const word = rest[i] ?? "";
      if (word === "--") {
        i += 1;
        break;
      }
      if (!word.startsWith("-") && !ASSIGNMENT.test(word)) break;
      i += valued.has(word) ? 2 : 1;
    }
    rest = rest.slice(i);
  }
}
function shellScriptArgument(args) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (!arg.startsWith("-")) return void 0;
    if (!arg.startsWith("--") && arg.includes("c")) return args[i + 1];
  }
  return void 0;
}
function expandHome(path, home) {
  const expanded = path.replace(/^~(?=\/|$)/, home).replace(/^\$\{HOME\}(?=\/|$)/, home).replace(/^\$HOME(?=\/|$)/, home);
  return /[$`]/.test(expanded) ? void 0 : expanded;
}
var GIT_GLOBAL_OPTIONS_WITH_VALUES = /* @__PURE__ */ new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--config-env"
]);
function checkGit(args, cwd, context) {
  let dir = cwd;
  let i = 0;
  while (i < args.length && (args[i] ?? "").startsWith("-")) {
    const option = args[i] ?? "";
    if (option === "-C") {
      const expanded = expandHome(args[i + 1] ?? ".", context.home);
      dir = expanded === void 0 || dir === void 0 ? void 0 : resolve(dir, expanded);
    }
    i += GIT_GLOBAL_OPTIONS_WITH_VALUES.has(option) ? 2 : 1;
  }
  const subcommand = args[i];
  const rest = args.slice(i + 1);
  if (subcommand === "commit") return checkCommit(rest);
  if (subcommand === "push") return checkPush(rest, dir, context);
  return [];
}
function isNoVerify(arg) {
  return arg.length >= "--no-veri".length && "--no-verify".startsWith(arg);
}
var COMMIT_LONG_OPTIONS_WITH_VALUES = /* @__PURE__ */ new Set([
  "--message",
  "--file",
  "--reuse-message",
  "--reedit-message",
  "--template",
  "--author",
  "--date",
  "--fixup",
  "--squash",
  "--trailer",
  "--cleanup",
  "--pathspec-from-file"
]);
var COMMIT_SHORT_OPTIONS_WITH_VALUES = /* @__PURE__ */ new Set(["m", "F", "C", "c", "t"]);
var COMMIT_SHORT_OPTIONS_WITH_ATTACHED_VALUES = /* @__PURE__ */ new Set(["u", "S"]);
function checkCommit(args) {
  let noVerify = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--") break;
    if (arg.startsWith("--")) {
      if (isNoVerify(arg)) noVerify = true;
      else if (arg === "--verify") noVerify = false;
      else if (COMMIT_LONG_OPTIONS_WITH_VALUES.has(arg)) i += 1;
    } else if (arg.startsWith("-")) {
      for (let j = 1; j < arg.length; j += 1) {
        const flag = arg.charAt(j);
        if (flag === "n") noVerify = true;
        if (COMMIT_SHORT_OPTIONS_WITH_ATTACHED_VALUES.has(flag)) break;
        if (COMMIT_SHORT_OPTIONS_WITH_VALUES.has(flag)) {
          if (j === arg.length - 1) i += 1;
          break;
        }
      }
    }
  }
  return noVerify ? [noVerifyFinding("git commit --no-verify", "commit")] : [];
}
function noVerifyFinding(command, hookKind) {
  return {
    rule: "noVerify",
    message: `agent-guardrails blocked \`${command}\`: it skips the ${hookKind} hooks that catch problems before they land. Run it without --no-verify and fix whatever the hook reports. If a hook itself is broken, tell the user instead of skipping it.`
  };
}
var PUSH_LONG_OPTIONS_WITH_VALUES = /* @__PURE__ */ new Set(["--repo", "--receive-pack", "--exec", "--push-option"]);
var FORCE_OPTIONS = ["--force", "--force-with-lease", "--force-if-includes"];
function checkPush(args, dir, context) {
  const findings = [];
  let force = false;
  let everyBranch = false;
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const name = arg.split("=")[0] ?? arg;
      if (isNoVerify(name)) findings.push(noVerifyFinding("git push --no-verify", "pre-push"));
      else if (FORCE_OPTIONS.includes(name)) force = true;
      else if (name === "--no-force-with-lease") force = false;
      else if (name === "--all" || name === "--branches" || name === "--mirror") everyBranch = true;
      else if (PUSH_LONG_OPTIONS_WITH_VALUES.has(arg)) i += 1;
    } else if (arg.startsWith("-") && arg.length > 1) {
      for (let j = 1; j < arg.length; j += 1) {
        const flag = arg.charAt(j);
        if (flag === "f") force = true;
        if (flag === "o") {
          if (j === arg.length - 1) i += 1;
          break;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  const current = () => dir === void 0 ? void 0 : context.currentBranch(dir);
  const isProtected = (branch) => branch !== void 0 && context.protectedBranches.includes(branch);
  const refspecs = positional.slice(1);
  const blocked = /* @__PURE__ */ new Set();
  if (force && everyBranch) {
    blocked.add("every branch");
  } else if (force && refspecs.length === 0) {
    const branch = current();
    if (isProtected(branch)) blocked.add(`\`${branch ?? ""}\``);
  }
  for (const refspec of refspecs) {
    const plus = refspec.startsWith("+");
    const spec = plus ? refspec.slice(1) : refspec;
    const destination = spec.includes(":") ? spec.slice(spec.indexOf(":") + 1) : spec;
    const name = destination.replace(/^refs\/heads\//, "");
    const branch = name === "HEAD" ? current() : name;
    if ((force || plus) && isProtected(branch)) blocked.add(`\`${branch ?? ""}\``);
  }
  for (const target of blocked) {
    findings.push({
      rule: "forcePush",
      message: `agent-guardrails blocked a force push to ${target}: it rewrites history that other people build on. Push your work to a feature branch and open a pull request, or ask the user to run the force push themselves.`
    });
  }
  return findings;
}
function checkRm(args, cwd, context) {
  let recursive = false;
  let optionsEnded = false;
  const targets = [];
  for (const arg of args) {
    if (optionsEnded || !arg.startsWith("-") || arg === "-") targets.push(arg);
    else if (arg === "--") optionsEnded = true;
    else if (arg === "--recursive") recursive = true;
    else if (!arg.startsWith("--") && /[rR]/.test(arg)) recursive = true;
  }
  if (!recursive) return [];
  const findings = [];
  for (const target of targets) {
    const reason = dangerousTarget(target, cwd, context);
    if (reason !== void 0) {
      findings.push({
        rule: "recursiveRm",
        message: `agent-guardrails blocked \`rm -r ${target}\`: the target is ${reason}. Delete the specific files or folders you mean, by path, inside the project.`
      });
    }
  }
  return findings;
}
function contains(parent, child) {
  const path = relative(parent, child);
  return path === "" || !path.startsWith("..") && !isAbsolute(path);
}
function dangerousTarget(target, cwd, context) {
  const withoutGlob = target.replace(/(^|\/)\.?\*$/, "$1") || ".";
  const expanded = expandHome(withoutGlob, context.home);
  if (expanded === void 0 || /[*?[]/.test(expanded)) return void 0;
  if (!isAbsolute(expanded) && cwd === void 0) return void 0;
  const path = resolve(cwd ?? "/", expanded);
  if (path === resolve("/")) return "the filesystem root";
  if (contains(path, context.home)) return path === context.home ? "your home directory" : "a folder that contains your home directory";
  const roots = [context.projectDir, context.repoRoot(cwd ?? context.cwd)];
  for (const root of roots) {
    if (root !== void 0 && contains(path, root)) {
      return path === root ? "the repository root" : "a folder that contains the repository";
    }
  }
  return void 0;
}

// src/hooks/guard-bash.ts
function git(dir, args) {
  try {
    const output = execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2e3
    }).trim();
    return output === "" ? void 0 : output;
  } catch {
    return void 0;
  }
}
runHook((input) => {
  const command = stringField(objectField(input, "tool_input"), "command");
  if (command === void 0) return void 0;
  const dir = projectDir(input);
  const config = loadConfig(dir);
  const findings = checkCommand(command, {
    cwd: stringField(input, "cwd") ?? dir,
    home: homedir(),
    projectDir: dir,
    protectedBranches: config.protectedBranches,
    repoRoot: (at) => git(at, ["rev-parse", "--show-toplevel"]),
    currentBranch: (at) => git(at, ["symbolic-ref", "--quiet", "--short", "HEAD"])
  }).filter((finding) => config[finding.rule]);
  if (findings.length === 0) return void 0;
  return denyToolUse([...new Set(findings.map((finding) => finding.message))].join("\n"));
});
