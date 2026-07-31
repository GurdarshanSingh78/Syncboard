const Lexer = (() => {
  const KEYWORDS = new Set([
    'function', 'return', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
    'class', 'extends', 'new', 'import', 'export', 'from', 'default', 'async',
    'await', 'try', 'catch', 'finally', 'switch', 'case', 'break', 'continue',
    'def', 'elif', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False',
    'self', 'this', 'null', 'undefined', 'true', 'false', 'void', 'typeof',
    'public', 'private', 'static', 'int', 'string', 'bool', 'struct', 'interface',
  ]);

  const TOKEN_RE = /(\/\/[^\n]*)|(#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*\b)|([A-Za-z_$][A-Za-z0-9_$]*)|(\s+)|([^\s])/g;

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function highlight(code) {
    let out = '';
    let match;
    TOKEN_RE.lastIndex = 0;
    while ((match = TOKEN_RE.exec(code))) {
      const [, comment1, comment2, str, num, word, space, sym] = match;
      if (comment1 || comment2) {
        out += `<span class="tok-comment">${escapeHtml(match[0])}</span>`;
      } else if (str) {
        out += `<span class="tok-string">${escapeHtml(str)}</span>`;
      } else if (num) {
        out += `<span class="tok-number">${escapeHtml(num)}</span>`;
      } else if (word) {
        out += KEYWORDS.has(word)
          ? `<span class="tok-keyword">${word}</span>`
          : escapeHtml(word);
      } else if (space) {
        out += space;
      } else if (sym) {
        out += `<span class="tok-sym">${escapeHtml(sym)}</span>`;
      }
    }
    return out;
  }

  return { highlight };
})();
