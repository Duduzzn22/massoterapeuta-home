// Produces dist/ for Vercel: public CSS bundled+minified into one
// file, public HTML minified with <link> tags rewritten, admin and
// other static files copied as-is.
//
// Local dev: unchanged — devs open index.html from the project root
// (6 separate CSS files, source HTML). Only Vercel runs this script.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { transform } from 'esbuild';
import { minify } from 'html-minifier-terser';

// Resolve top-level `@import url("./relative.css");` statements by inlining
// the referenced file content. Prevents @import from surviving into the
// public bundle (prod only serves bundle.css).
function inlineCssImports(path, seen = new Set()) {
  const absolute = resolve(path);
  if (seen.has(absolute)) return '';
  seen.add(absolute);
  const content = readFileSync(absolute, 'utf8');
  const dir = dirname(absolute);
  return content.replace(
    /@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*;?/g,
    (_, importPath) => inlineCssImports(join(dir, importPath), seen),
  );
}

const OUT = 'dist';

const PUBLIC_CSS_IN_ORDER = [
  'Css/base.css',
  'Css/layout.css',
  'Css/components.css',
  'Css/sections.css',
  'Css/mobile.css',
  'Css/agendamento.css',
];

const PUBLIC_HTML_FILES = ['index.html', 'privacidade.html'];

// Directories/files to exclude from the dist copy. supabase/ ships
// via a separate workflow; docs/scripts/.github are tooling; dist and
// node_modules are build artifacts; .claude/.git are IDE/VCS.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.claude', '.github',
  'scripts', 'supabase', 'docs',
]);
const SKIP_FILES = new Set(['package.json', 'package-lock.json', '.gitignore', 'README.md']);

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);

// Copy each top-level source separately so cpSync never sees `.` -> `dist/`
// (which it rejects as "copy into self").
for (const entry of readdirSync('.', { withFileTypes: true })) {
  const name = entry.name;
  if (name === OUT) continue;
  if (SKIP_DIRS.has(name)) continue;
  if (SKIP_FILES.has(name)) continue;
  cpSync(name, join(OUT, name), { recursive: true });
}

// Bundle: concatenate the 6 public CSS files, then run esbuild to minify
// the whole thing in one shot (dedupes nothing semantic, just strips
// whitespace/comments — safe for hand-authored CSS).
const concatenated = PUBLIC_CSS_IN_ORDER
  .map(f => `/* ${f} */\n${inlineCssImports(f)}`)
  .join('\n\n');
const { code: minifiedCss } = await transform(concatenated, {
  loader: 'css',
  minify: true,
});
writeFileSync(join(OUT, 'bundle.css'), minifiedCss);

// Delete the dist copies of the 6 PUBLIC CSS files so prod serves only
// bundle.css. Keep admin-specific CSS (admin.css, admin-mobile.css,
// responsive-hardening.css) since admin.html references them directly.
for (const f of PUBLIC_CSS_IN_ORDER) {
  rmSync(join(OUT, f), { force: true });
}

// Collapse the <link rel="stylesheet" href="Css/*.css" /> sequence into
// a single <link href="bundle.css"> in each public HTML, then minify.
const LINK_SEQ = /(?:\s*<link rel="stylesheet" href="Css\/[^"]+"\s*\/>)+/g;
for (const file of PUBLIC_HTML_FILES) {
  const outPath = join(OUT, file);
  if (!existsSync(outPath)) continue;
  let html = readFileSync(outPath, 'utf8');
  html = html.replace(LINK_SEQ, '\n  <link rel="stylesheet" href="bundle.css" />');
  html = await minify(html, {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: true,
    useShortDoctype: true,
  });
  writeFileSync(outPath, html);
}

console.log(
  `[build-static] dist/ ready: 1 bundle.css (${minifiedCss.length} bytes), ${PUBLIC_HTML_FILES.length} minified HTML files`
);
