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
  external: ['vscode', 'node-pty'],
  format: 'cjs',
};

const extensionConfig = {
  ...baseConfig,
  entryPoints: ['./src/extension.ts'],
  outfile: './dist/extension.cjs',
  metafile: production,
};

const webviewConfig = {
  bundle: true,
  minify: production,
  sourcemap: !production ? 'inline' : false,
  sourcesContent: false,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  logLevel: 'info',
  entryPoints: ['./src/webview/index.tsx'],
  outfile: './dist/webview.js',
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.css': 'css',
    '.svg': 'dataurl',
  },
  metafile: production,
};

async function build() {
  try {
    if (watch) {
      const extCtx = await esbuild.context(extensionConfig);
      const webCtx = await esbuild.context(webviewConfig);
      await Promise.all([extCtx.watch(), webCtx.watch()]);
      console.log('[watch] Build started (extension + webview)');
    } else {
      await Promise.all([
        esbuild.build(extensionConfig),
        esbuild.build(webviewConfig),
      ]);
      console.log('[build] Build complete (extension + webview)');

      if (production) {
        const extResult = await esbuild.build({
          ...extensionConfig,
          metafile: true,
        });

        if (extResult.metafile) {
          const analysis = await esbuild.analyzeMetafile(extResult.metafile);
          console.log('\n[analysis] Extension bundle analysis:');
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
