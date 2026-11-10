// Builds the Electron main and preload processes with esbuild.
// Runtime deps (electron, node-pty, workspace packages, Node built-ins) stay
// external; only our TypeScript sources are transpiled and bundled.
import esbuild from 'esbuild';
import { rm } from 'node:fs/promises';

await rm('dist/main', { recursive: true, force: true });
await rm('dist/preload', { recursive: true, force: true });

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  packages: 'external',
  sourcemap: false,
  logLevel: 'info'
};

await Promise.all([
  esbuild.build({
    ...common,
    entryPoints: ['src/main/index.ts'],
    outfile: 'dist/main/index.js'
  }),
  esbuild.build({
    ...common,
    entryPoints: ['src/preload/index.ts', 'src/preload/stats-dialog-preload.ts'],
    outdir: 'dist/preload'
  })
]);

console.log('Electron main/preload build complete.');
