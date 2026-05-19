import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import MarkdownIt from 'markdown-it';

const README_PATH = path.join(__dirname, '../../README.md');

const STYLES = `
html, body { background: #0d1117; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #c9d1d9; }
code { background: #161b22; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; color: #e6edf3; }
pre { background: #161b22; padding: 1rem; overflow-x: auto; border-radius: 6px; border: 1px solid #30363d; }
pre code { background: transparent; padding: 0; font-size: 0.9em; }
table { border-collapse: collapse; margin: 1rem 0; }
th, td { border: 1px solid #30363d; padding: 6px 13px; }
th { background: #161b22; text-align: left; }
blockquote { border-left: 4px solid #30363d; padding-left: 1rem; color: #8b949e; margin-left: 0; }
a { color: #58a6ff; text-decoration: none; }
a:hover { text-decoration: underline; }
h1, h2 { border-bottom: 1px solid #30363d; padding-bottom: 4px; margin-top: 2rem; color: #f0f6fc; }
h3, h4 { color: #f0f6fc; }
hr { border: 0; border-top: 1px solid #30363d; margin: 2rem 0; }
strong { color: #f0f6fc; }
`.trim();

const HTML = renderReadmeOnce();

function renderReadmeOnce(): string {
  const markdown = fs.readFileSync(README_PATH, 'utf8');
  const md = new MarkdownIt({ linkify: true, typographer: true });
  const body = md.render(markdown);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Workflow Engine</title>
  <style>${STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;
}

const router = Router();

router.get('/', (_req, res) => {
  res.type('html').send(HTML);
});

export default router;
