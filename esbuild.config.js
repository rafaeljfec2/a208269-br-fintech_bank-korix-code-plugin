import esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const baseConfig = {
  bundle: true,
  minify: production,
  sourcemap: !production ? 'inline' : false,
  sourcesContent: false,
  platform: 'node',
  target: 'node18',
  logLevel: 'info',
  external: ['vscode'],
  format: 'cjs',
};

const extensionConfig = {
  ...baseConfig,
  entryPoints: ['./src/extension.ts'],
  outfile: './dist/extension.js',
  metafile: production,
};

async function build() {
  try {
    if (watch) {
      const ctx = await esbuild.context(extensionConfig);
      await ctx.watch();
      console.log('[watch] Build started (extension)');
    } else {
      await esbuild.build(extensionConfig);
      console.log('[build] Build complete (extension)');

      if (production) {
        const result = await esbuild.build({
          ...extensionConfig,
          metafile: true,
        });

        if (result.metafile) {
          const analysis = await esbuild.analyzeMetafile(result.metafile);
          console.log('\n[analysis] Bundle analysis:');
          console.log(analysis);
        }
      }
    }
  } catch (error) {
    console.error('[error] Build failed:', error);
    process.exit(1);
  }
}

build();
