// Builds guide/Ion-Guide.html and guide/Ion-Guide.pdf from guide/parts/*.md
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { renderMarkdown, escapeHtml } from "../src/runtime/webui/markdown.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const partsDir = path.join(root, "guide", "parts");
const imgDir = path.join(root, "guide", "img");

const VERSION = "1.0";
const DATE = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

// ---- markdown -> html ------------------------------------------------------
let md = fs
  .readdirSync(partsDir).filter((f) => f.endsWith(".md")).sort()
  .map((f) => fs.readFileSync(path.join(partsDir, f), "utf-8").replace(/\r\n/g, "\n"))
  .join("\n\n");
md = md.replace(/```ion-run\n/g, "```ion\n").replace(/```ion-bad\n/g, "```ion\n");

let html = renderMarkdown(md);

// images: inline as data URIs so the HTML and PDF are self-contained
html = html.replace(/<img src="\/img\/([^"]+)" alt="([^"]*)"[^>]*>/g, (_, file, alt) => {
  const p = path.join(imgDir, file);
  if (!fs.existsSync(p)) return `<em>[missing figure: ${escapeHtml(file)}]</em>`;
  const data = fs.readFileSync(p).toString("base64");
  const narrow = file.includes("mobile") ? " narrow" : "";
  return `<figure class="shot${narrow}"><img src="data:image/png;base64,${data}" alt="${alt}" /><figcaption>${alt}</figcaption></figure>`;
});
// a figure sits alone in its own paragraph
html = html.replace(/<p>(<figure[\s\S]*?<\/figure>)<\/p>/g, "$1");

// callouts
html = html.replace(/<blockquote><p><strong>(Try it|Tip|Warning|Note)\.<\/strong>/g, (_, kind) =>
  `<blockquote class="callout ${kind.toLowerCase().replace(" ", "")}"><p><strong class="callout-label">${kind}</strong>`);

// output / error blocks look different from code
html = html.replace(/<div class="code-block">(<div class="code-head"><span class="code-lang">(output|error)<\/span>)/g, '<div class="code-block out $2">$1');

// drop the copy buttons and the rules between chapters
html = html.replace(/<button class="code-copy"[^>]*>Copy<\/button>/g, "").replace(/<hr \/>/g, "");

// headings: chapter number styling + ids for links and the contents page
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const toc = [];
html = html.replace(/<h([23])>(.*?)<\/h\1>/g, (_, level, inner) => {
  const plain = decode(inner.replace(/<[^>]+>/g, ""));
  const id = `s-${slug(plain)}`;
  if (level === "2") {
    const m = plain.match(/^(\d+|Appendix [A-Z])\s{2}(.*)$/);
    const label = m ? (/^\d+$/.test(m[1]) ? `Chapter ${m[1]}` : m[1]) : "";
    const title = m ? m[2] : plain;
    toc.push({ id, label, title, sections: [] });
    return `<h2 id="${id}">${label ? `<span class="chnum">${escapeHtml(label)}</span>` : ""}<span class="chtitle">${inner.replace(/^(\d+|Appendix [A-Z])&nbsp;|^(\d+|Appendix [A-Z])\s{2}/, "")}</span></h2>`;
  }
  toc.at(-1)?.sections.push({ id, title: plain });
  return `<h3 id="${id}">${inner}</h3>`;
});

const tocHtml = toc
  .map((c) =>
    `<div class="toc-ch"><a class="toc-title" href="#${c.id}"><span class="toc-num">${escapeHtml(c.label)}</span>${escapeHtml(c.title)}</a>` +
    (c.sections.length
      ? `<p class="toc-secs">${c.sections.map((s) => `<a href="#${s.id}">${escapeHtml(s.title.replace(/^[\d.]+\s+/, ""))}</a>`).join(" &middot; ")}</p>`
      : "") +
    `</div>`
  ).join("");

const logo = `<svg viewBox="0 0 32 32" width="84" height="84"><rect width="32" height="32" rx="9" fill="#c15f3c"/><path d="M16 6l2.6 7.4L26 16l-7.4 2.6L16 26l-2.6-7.4L6 16l7.4-2.6z" fill="#fff"/></svg>`;

const css = `
@page { size: A4; margin: 22mm 20mm 24mm 20mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #25231f; font: 10.3pt/1.6 "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif; }
a { color: #a8492a; text-decoration: none; }
p { margin: 0 0 .75em; orphans: 3; widows: 3; }

.cover { height: 247mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
.cover .logo { margin-bottom: 28px; }
.cover h1 { font: 700 54pt/1.05 Georgia, "Times New Roman", serif; letter-spacing: -.02em; margin: 0 0 14px; }
.cover h1 span { color: #c15f3c; }
.cover .sub { font: 400 17pt/1.35 Georgia, serif; color: #5b574e; max-width: 130mm; margin: 0 0 40px; }
.cover pre { margin: 0 0 40px; padding: 16px 20px; border-radius: 12px; background: #f4f1e8; border: 1px solid #e4dfd0; font: 10.5pt/1.6 Consolas, "Cascadia Code", monospace; max-width: 120mm; }
.cover .meta { color: #8a857a; font-size: 10pt; }

.toc-page { page-break-after: always; }
.toc-page h1 { font: 700 26pt Georgia, serif; margin: 0 0 14px; padding-bottom: 8px; border-bottom: 2px solid #c15f3c; }
.toc-ch { break-inside: avoid; margin: 0 0 9px; }
.toc-title { display: block; font-weight: 650; font-size: 10.8pt; color: #25231f; }
.toc-num { display: inline-block; min-width: 24mm; color: #c15f3c; font-weight: 600; }
.toc-secs { margin: 1px 0 0 24mm; font-size: 8.2pt; line-height: 1.5; color: #8a857a; }
.toc-secs a { color: #6d695f; }

h2 { page-break-before: always; font: 700 25pt/1.15 Georgia, "Times New Roman", serif; letter-spacing: -.01em; margin: 0 0 .7em; padding-bottom: 10px; border-bottom: 2px solid #c15f3c; }
h2 .chnum { display: block; font: 600 10pt "Segoe UI", sans-serif; text-transform: uppercase; letter-spacing: .14em; color: #c15f3c; margin-bottom: 4px; }
h3 { font: 700 15pt/1.25 Georgia, serif; margin: 1.7em 0 .5em; break-after: avoid; }
h4 { font: 700 11.5pt/1.3 "Segoe UI", sans-serif; margin: 1.3em 0 .4em; break-after: avoid; color: #3a372f; }
h5, h6 { break-after: avoid; }

ul, ol { margin: 0 0 .8em; padding-left: 1.5em; }
li { margin: .2em 0; }
li > ul, li > ol { margin: .2em 0 0; }

code { font: 9pt Consolas, "Cascadia Code", "SF Mono", monospace; background: #f1eee5; border: 1px solid #e4dfd0; padding: .05em .3em; border-radius: 4px; }
.code-block { margin: .3em 0 1em; border: 1px solid #ddd8c8; border-radius: 8px; overflow: hidden; background: #f7f5ee; }
.code-head { padding: 3px 12px; background: #ece8db; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .1em; color: #7a7568; }
.code-block pre { margin: 0; padding: 10px 14px; white-space: pre-wrap; word-break: break-word; orphans: 4; widows: 4; }
.code-block code { background: none; border: 0; padding: 0; font-size: 8.8pt; line-height: 1.55; }
.code-block.out { background: #fff; border-style: dashed; margin-top: -.55em; }
.code-block.out .code-head { background: #fff; color: #2f7d52; padding-bottom: 0; }
.code-block.out.error .code-head { color: #b43b34; }
.code-block.out pre { color: #2d2a24; padding-top: 4px; }
.tok-c { color: #8a857a; font-style: italic; } .tok-s { color: #1f7a4d; } .tok-n { color: #b5651d; } .tok-k { color: #b0346a; font-weight: 600; }

.table-wrap { margin: .4em 0 1.1em; break-inside: avoid; }
table { border-collapse: collapse; width: 100%; font-size: 9.2pt; }
th, td { padding: 5px 9px; text-align: left; vertical-align: top; border-bottom: 1px solid #e4dfd0; }
th { background: #f1eee5; font-weight: 650; border-bottom: 2px solid #d7d1be; }
td code, th code { font-size: 8.4pt; }
tr { break-inside: avoid; }

blockquote { margin: .4em 0 1em; padding: 9px 14px; border-left: 4px solid #cfc9b7; background: #f7f5ee; border-radius: 0 8px 8px 0; break-inside: avoid; }
blockquote p:last-child { margin-bottom: 0; }
blockquote.callout .callout-label { display: block; font-size: 7.8pt; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 2px; }
blockquote.tip { border-color: #2f7d52; background: #eef7f1; } blockquote.tip .callout-label { color: #2f7d52; }
blockquote.tryit { border-color: #c15f3c; background: #fbefe9; } blockquote.tryit .callout-label { color: #c15f3c; }
blockquote.warning { border-color: #b43b34; background: #fbeceb; } blockquote.warning .callout-label { color: #b43b34; }
blockquote.note { border-color: #5a6fa8; background: #eef1f9; } blockquote.note .callout-label { color: #5a6fa8; }

figure.shot { margin: .6em 0 1.2em; break-inside: avoid; text-align: center; }
figure.shot img { max-width: 100%; max-height: 98mm; border: 1px solid #ddd8c8; border-radius: 8px; box-shadow: 0 2px 10px rgb(60 40 10 / 10%); }
figure.shot.narrow img { max-height: 135mm; max-width: 62mm; }
figcaption { font-size: 8.5pt; color: #8a857a; margin-top: 5px; }
.md-image { display: none; }
input[type=checkbox] { margin-right: 4px; }
`;

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ion: The Complete Guide</title><style>${css}</style></head><body>
<section class="cover">
  <div class="logo">${logo}</div>
  <h1>Ion<span>.</span></h1>
  <p class="sub">The complete guide to building AI agents in plain English.</p>
  <pre>agent buddy:
    model "gemini/gemini-2.5-flash"
    role "You are a friendly assistant."

say ask buddy "Hello there!"</pre>
  <div class="meta">Version ${VERSION} &middot; ${escapeHtml(DATE)}</div>
</section>
<section class="toc-page"><h1>Contents</h1>${tocHtml}</section>
${html}
</body></html>`;

const outHtml = path.join(root, "guide", "Ion-Guide.html");
const outPdf = path.join(root, "guide", "Ion-Guide.pdf");
fs.writeFileSync(outHtml, page);

let browser;
try {
  browser = await chromium.launch({ channel: "msedge" });
} catch {
  browser = await chromium.launch();
}
const tab = await browser.newPage();
await tab.goto(pathToFileURL(outHtml).href);
await tab.pdf({
  path: outPdf,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate:
    '<div style="width:100%;font:8px Segoe UI,Arial,sans-serif;color:#8a857a;padding:0 20mm;display:flex;justify-content:space-between"><span>Ion: The Complete Guide</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: "22mm", bottom: "24mm", left: "20mm", right: "20mm" },
  outline: true,
  tagged: true
});
await browser.close();
const kb = Math.round(fs.statSync(outPdf).size / 1024);
console.log(`Built ${path.relative(root, outPdf)} (${kb} KB) and ${path.relative(root, outHtml)}`);
