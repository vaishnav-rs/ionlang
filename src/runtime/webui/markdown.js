// Small, dependency-free, XSS-safe Markdown renderer plus a light syntax highlighter.
// Pure functions only (string in, HTML string out) so it runs in the browser and in tests.

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const KEYWORDS = {
  js: "const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this null undefined true false",
  py: "def class return if elif else for while in not and or is import from as with try except finally raise lambda None True False pass break continue yield async await self",
  sh: "if then else fi for do done while case esac function echo cd ls cat grep export sudo npm npx git curl",
  json: "true false null",
  ion: "set say add remove to if otherwise else repeat times forever for each in while stop skip give back try on error use agent team tool chat serve describe ask user and or not is contains model role key can input output lead members remembers forgets yes no nothing"
};
const ALIASES = { javascript: "js", typescript: "js", ts: "js", jsx: "js", tsx: "js", python: "py", bash: "sh", shell: "sh", zsh: "sh", powershell: "sh" };

const PLAIN = new Set(["", "text", "txt", "plain", "output", "error", "console"]);

export function highlight(code, lang) {
  if (PLAIN.has(lang)) return escapeHtml(code);
  const key = ALIASES[lang] || lang;
  const words = new Set((KEYWORDS[key] || "").split(" ").filter(Boolean));
  const comment = key === "py" || key === "sh" || key === "ion" ? "#" : "//";
  const re = new RegExp(
    `(${comment === "#" ? "#[^\\n]*" : "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/"})|("""[\\s\\S]*?"""|"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'|\`(?:\\\\.|[^\`\\\\])*\`)|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_][A-Za-z0-9_]*)`,
    "g"
  );
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    out += escapeHtml(code.slice(last, m.index));
    const [tok, com, str, num, word] = m;
    if (com) out += `<span class="tok-c">${escapeHtml(tok)}</span>`;
    else if (str) out += `<span class="tok-s">${escapeHtml(tok)}</span>`;
    else if (num) out += `<span class="tok-n">${escapeHtml(tok)}</span>`;
    else if (word && words.has(word)) out += `<span class="tok-k">${escapeHtml(tok)}</span>`;
    else out += escapeHtml(tok);
    last = m.index + tok.length;
  }
  return out + escapeHtml(code.slice(last));
}

function safeUrl(url) {
  const u = url.trim();
  return /^(https?:\/\/|mailto:|\/|#)/i.test(u) ? u : null;
}

// Inline formatting. Works on already-isolated text; code spans are lifted out first
// so their contents are never touched by the other rules.
export function renderInline(text) {
  const codes = [];
  let s = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, c) => {
    codes.push(`<code>${escapeHtml(c.trim())}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = escapeHtml(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
    const u = safeUrl(url.replace(/&amp;/g, "&"));
    return u ? `<img src="${escapeHtml(u)}" alt="${alt}" loading="lazy" />` : alt;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const u = safeUrl(url.replace(/&amp;/g, "&"));
    return u ? `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?'"])/g, (_, pre, url) =>
    `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  s = s.replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`);
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, (_, pre, a) => `${pre}<em>${a}</em>`);
  s = s.replace(/(^|[^_\w])_([^_\n]+)_(?![_\w])/g, (_, pre, a) => `${pre}<em>${a}</em>`);
  s = s.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
}

const isTableSep = (l) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l) && l.includes("-");
const splitRow = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const listItem = (l) => l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w+-]*)/);
    if (fence) {
      const lang = (fence[2] || "").toLowerCase();
      const body = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (or end of input while streaming)
      const code = body.join("\n");
      out.push(
        `<div class="code-block"><div class="code-head"><span class="code-lang">${escapeHtml(lang || "text")}</span>` +
        `<button class="code-copy" type="button" data-copy aria-label="Copy code">Copy</button></div>` +
        `<pre><code>${highlight(code, lang)}</code></pre></div>`
      );
      continue;
    }

    if (/^\s*$/.test(line)) { i++; continue; }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const level = Math.min(h[1].length + 1, 6); // keep h1 visually modest inside a chat
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push("<hr />"); i++; continue; }

    // table
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : ""));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && !/^\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]));
      const cell = (tag, c, n) => `<${tag}${aligns[n] ? ` style="text-align:${aligns[n]}"` : ""}>${renderInline(c)}</${tag}>`;
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c, n) => cell("th", c, n)).join("")}</tr></thead>` +
        `<tbody>${rows.map((r) => `<tr>${head.map((_, n) => cell("td", r[n] ?? "", n)).join("")}</tr>`).join("")}</tbody></table></div>`
      );
      continue;
    }

    // blockquote
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(body.join("\n"))}</blockquote>`);
      continue;
    }

    // list (single level of nesting by indentation)
    if (listItem(line)) {
      const baseIndent = listItem(line)[1].length;
      const ordered = /\d/.test(listItem(line)[2]);
      const items = [];
      while (i < lines.length) {
        const m = listItem(lines[i]);
        if (m && m[1].length <= baseIndent + 1) {
          items.push({ text: [m[3]], children: [] });
          i++;
        } else if (m && items.length) {
          const kids = [];
          while (i < lines.length && listItem(lines[i]) && listItem(lines[i])[1].length > baseIndent + 1) kids.push(lines[i++].slice(baseIndent + 2));
          items[items.length - 1].children.push(kids.join("\n"));
        } else if (items.length && /^\s+\S/.test(lines[i]) && !listItem(lines[i])) {
          items[items.length - 1].text.push(lines[i++].trim());
        } else break;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(
        `<${tag}>` +
        items.map((it) => {
          let t = it.text.join(" ");
          let cls = "";
          const task = t.match(/^\[( |x|X)\]\s+(.*)$/);
          if (task) { cls = ' class="task"'; t = `<input type="checkbox" disabled${task[1] !== " " ? " checked" : ""} /> ${renderInline(task[2])}`; }
          else t = renderInline(t);
          return `<li${cls}>${t}${it.children.map(renderMarkdown).join("")}</li>`;
        }).join("") +
        `</${tag}>`
      );
      continue;
    }

    // paragraph: consume until a blank line or the start of another block
    const para = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*(```|~~~|#{1,6}\s|>)/.test(lines[i]) &&
      !listItem(lines[i]) &&
      !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i])
    ) para.push(lines[i++]);
    if (!para.length) { para.push(lines[i++]); }
    out.push(`<p>${para.map(renderInline).join("<br />")}</p>`);
  }
  return out.join("");
}
