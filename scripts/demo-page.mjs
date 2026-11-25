// Builds the demo (made-up data, in-memory GitHub) and packs it into one HTML
// file that can be shared as a Claude artifact: dist-demo/bookjournal-demo.html
// Usage: npm run demo

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'demo', '--outDir', 'dist-demo', '--emptyOutDir'], { stdio: 'inherit' });

const dir = 'dist-demo/assets';
const files = readdirSync(dir);
const js = files.filter((f) => f.endsWith('.js'));
const css = files.find((f) => f.endsWith('.css'));
let style = readFileSync(`${dir}/${css}`, 'utf8');
for (const f of files.filter((f) => f.endsWith('.woff2')))
  style = style.replaceAll(`./${f}`, `data:font/woff2;base64,${readFileSync(`${dir}/${f}`).toString('base64')}`).replaceAll(f, `data:font/woff2;base64,${readFileSync(`${dir}/${f}`).toString('base64')}`);

const html = readFileSync('dist-demo/index.html', 'utf8');
const entry = /<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/.exec(html)[1];
if (js.length !== 1 || js[0] !== entry) throw new Error(`expected one script, got ${js.join(', ')}`);
const script = readFileSync(`${dir}/${entry}`, 'utf8').replaceAll('</script', '<\\/script');

const page = `<title>Learning journal demo</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${style}</style>
<div id="root"></div>
<script type="module">${script}</script>
`;
writeFileSync('dist-demo/bookjournal-demo.html', page);
console.log(`dist-demo/bookjournal-demo.html: ${(page.length / 1024).toFixed(0)} KB, ${js.length} chunk(s)`);
