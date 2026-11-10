import { build } from 'esbuild';
import { execSync } from 'child_process';

// Type declarations and the three bundles are independent, so run them
// concurrently instead of serially.
const generateTypes = new Promise((resolve, reject) => {
  console.log('Generating TypeScript definitions...');
  try {
    execSync('tsc --emitDeclarationOnly', { stdio: 'inherit' });
    resolve();
  } catch (err) {
    reject(err);
  }
});

const browserBundle = build({
  entryPoints: ['src/browser.ts'],
  bundle: true,
  outfile: 'dist/browser.mjs',
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true
});

const nodeEsmBundle = build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.mjs',
  format: 'esm',
  platform: 'node',
  target: 'node18',
  external: ['child_process', 'path', 'crypto'],
  sourcemap: true
});

const nodeCjsBundle = build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.cjs',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['child_process', 'path', 'crypto'],
  sourcemap: true
});

await Promise.all([generateTypes, browserBundle, nodeEsmBundle, nodeCjsBundle]);

console.log('Build complete!');
