/**
 * A deliberately small shell tokenizer. It splits a command line into simple commands
 * and their words, honoring quotes and escapes, so that text inside quotes is treated
 * as an argument rather than a command (AC-B5).
 *
 * It does not expand variables, globs or command substitutions inside double quotes,
 * and it does not understand here-docs, functions or control flow keywords. Those
 * limits are listed in the README.
 */

export type SimpleCommand = string[];

const COMMAND_SEPARATORS = new Set([';', '&', '|', '\n', '(', ')', '`']);
const WORD_BREAKS = new Set([' ', '\t', '\r']);

export function splitCommands(script: string): SimpleCommand[] {
  const commands: SimpleCommand[] = [];
  let words: string[] = [];
  let word = '';
  let inWord = false;
  let skipNextWord = false;

  const endWord = () => {
    if (inWord) {
      if (skipNextWord) skipNextWord = false;
      else words.push(word);
    }
    word = '';
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
        if (inner === '\\' && ['"', '\\', '$', '`'].includes(next)) {
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

    if (char === '\\') {
      const next = script.charAt(i + 1);
      if (next !== '\n') {
        word += next;
        inWord = true;
      }
      i += 2;
      continue;
    }

    if (char === '#' && !inWord) {
      const newline = script.indexOf('\n', i);
      i = newline === -1 ? script.length : newline;
      continue;
    }

    if (char === '$' && script.charAt(i + 1) === '(') {
      endCommand();
      i += 2;
      continue;
    }

    if (char === '>' || char === '<') {
      // A redirection: drop a file descriptor number written right before it, then
      // skip any `>`, `&` or `|` that completes the operator and the target word after it.
      if (/^\d+$/.test(word)) {
        word = '';
        inWord = false;
      }
      endWord();
      i += 1;
      while (i < script.length && '<>&|'.includes(script.charAt(i))) i += 1;
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
