const path = require('path');
const esbuild = require('esbuild');

const backendDir = path.join(__dirname, '..');
const frontendDir = path.join(backendDir, '..', 'frontend');
const entry = path.join(frontendDir, 'src', 'renderDocumentToHtml.tsx');
const outfile = path.join(backendDir, 'dist', 'documentViewBundle.cjs');

esbuild
  .build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    external: ['react', 'react-dom'],
  })
  .then(() => console.log('documentViewBundle.cjs built at', outfile))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
