#!/usr/bin/env bash
# Builds the deployable site in _site (run by .github/workflows/pages.yml).
# The source files stay as plain ES modules; the deployed copy bundles and
# minifies them so phones download a few files at once instead of a long
# chain of small imports.
set -euo pipefail
ESBUILD="${ESBUILD:-npx --yes esbuild@0.28.2}"
rm -rf _site && mkdir _site
# Ship only the website: the multi-MB originals in /photos stay out of the deploy.
cp -r *.html robots.txt sitemap.xml assets .nojekyll _site/

# One bundle per page (+ shared chunks). three.js stays a separate file, loaded only by the 3D parts.
$ESBUILD assets/js/pages/*.js assets/js/admin.js --bundle --splitting --format=esm --minify --target=es2020 \
  --external:three --outdir=_site/assets/js/build --entry-names=[name] --chunk-names=chunk-[hash] --log-level=warning \
  --metafile=_site/meta.json
for f in _site/*.html; do
  sed -i -e 's#assets/js/pages/\([a-z-]*\)\.js#assets/js/build/\1.js#' -e 's#src="assets/js/admin\.js"#src="assets/js/build/admin.js"#' "$f"
done

# <link rel="modulepreload"> for each page's bundle and every chunk it imports, so the
# phone fetches them all at once instead of discovering them one by one.
node - <<'JS'
const fs = require('fs');
const { outputs } = JSON.parse(fs.readFileSync('_site/meta.json', 'utf8'));
const deps = (file, seen = new Set()) => {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const i of outputs[file]?.imports || []) if (i.kind === 'import-statement' && !i.external) deps(i.path, seen);
  return seen;
};
for (const html of fs.readdirSync('_site').filter((f) => f.endsWith('.html'))) {
  let s = fs.readFileSync(`_site/${html}`, 'utf8');
  const m = s.match(/<script type="module" src="(assets\/js\/build\/[\w-]+\.js)"><\/script>/);
  if (!m) continue;
  const links = [...deps(`_site/${m[1]}`)].map((f) => `  <link rel="modulepreload" href="${f.replace(/^_site\//, '')}" />`).join('\n');
  fs.writeFileSync(`_site/${html}`, s.replace('</head>', `${links}\n</head>`));
}
JS
rm _site/meta.json

# Minified CSS
for css in assets/css/*.css; do $ESBUILD "$css" --minify --log-level=warning --outfile="_site/$css" --allow-overwrite; done
echo "Built _site"
