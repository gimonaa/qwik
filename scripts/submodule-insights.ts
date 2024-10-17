import { build } from 'esbuild';
import RawPlugin from 'esbuild-plugin-raw';
import { execa } from 'execa';
import { join } from 'node:path';
import { rollup } from 'rollup';
import { writePackageJson } from './package-json';
import { type BuildConfig, nodeTarget, type PackageJSON, panic, unlink, writeFile } from './util';

export async function submoduleInsights(config: BuildConfig) {
  await buildComponents(config);
  await buildVite(config);
  await bundle(config);

  console.log(`📈 insights`);
}

async function buildComponents(config: BuildConfig) {
  const execOptions = {
    win: {
      manager: 'npm',
      command: ['run', 'build.insights'],
    },
    other: {
      manager: 'pnpm',
      command: ['build.insights'],
    },
  };
  const isWindows = process.platform.includes('win32');
  const runOptions = isWindows ? execOptions.win : execOptions.other;

  const result = await execa(runOptions.manager, runOptions.command, {
    stdout: 'inherit',
    cwd: config.srcQwikDir,
  });
  if (result.failed) {
    panic(`tsc failed`);
  }
}

const external = ['fs', 'path', 'vite', 'typescript', '@qwik.dev/core/optimizer'];

async function buildVite(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikDir, 'insights', 'src', 'vite', 'insights-plugin.ts')];

  await build({
    entryPoints,
    outfile: join(config.distQwikPkgDir, 'insights', 'vite.js'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external,
    plugins: [RawPlugin()],
  });
}

async function bundle(config: BuildConfig) {
  const distBase = join(config.distQwikPkgDir, 'insights');

  const indexCode = ["export * from './insights';", "export * from './vite';"];

  await writeFile(join(distBase, 'index.js'), indexCode.join('\n'));

  const entryPoint = join(distBase, 'index.js');

  const build = await rollup({
    input: entryPoint,
  });

  await build.write({
    file: join(distBase, 'index.mjs'),
    format: 'es',
  });

  await build.write({
    file: join(distBase, 'index.cjs'),
    format: 'cjs',
  });

  // Delete leftovers
  await Promise.all([
    unlink(join(distBase, 'vite.js')),
    unlink(join(distBase, 'insights.js')),
    unlink(join(distBase, 'index.js')),
  ]);

  // Create package.json

  const insightsPkg: PackageJSON = {
    name: `@qwik.dev/core/insights`,
    version: config.distVersion,
    main: `index.mjs`,
    types: `index.d.ts`,
    private: true,
    type: 'module',
  };
  await writePackageJson(distBase, insightsPkg);
}
