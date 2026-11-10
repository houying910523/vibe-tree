// Single-process production build for the desktop app:
// esbuild (main/preload) and Vite (renderer) run in parallel, then the
// static HTML asset is copied. Avoids nested pnpm/concurrently processes.
import esbuild from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdir, copyFile, rm } from 'node:fs/promises';

// esbuild emits bundled entry files, so clear previous tsc/esbuild output
// first to avoid stale modules lingering in dist/main and dist/preload.
await rm('dist/main', { recursive: true, force: true });
await rm('dist/preload', { recursive: true, force: true });

const electronCommon = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  packages: 'external',
  sourcemap: false,
  logLevel: 'info'
};

const electronBuild = Promise.all([
  esbuild.build({
    ...electronCommon,
    entryPoints: ['src/main/index.ts'],
    outfile: 'dist/main/index.js'
  }),
  esbuild.build({
    ...electronCommon,
    entryPoints: ['src/preload/index.ts', 'src/preload/stats-dialog-preload.ts'],
    outdir: 'dist/preload'
  })
]);

// Vite automatically picks up vite.config.ts from the working directory.
const rendererBuild = viteBuild({ logLevel: 'info' });

await Promise.all([electronBuild, rendererBuild]);

await mkdir('dist/main', { recursive: true });
await copyFile('src/main/stats-dialog.html', 'dist/main/stats-dialog.html');

console.log('Desktop build complete.');
