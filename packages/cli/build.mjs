// CLI is a single CJS entry; keep all packages external and transpile only.
import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  packages: 'external',
  sourcemap: false,
  logLevel: 'info'
});

console.log('CLI build complete.');
