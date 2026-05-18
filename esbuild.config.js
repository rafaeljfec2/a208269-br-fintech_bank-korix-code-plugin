import esbuild from 'esbuild';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

/**
 * CRITICAL: CSS HANDLING RULES
 *
 * ❌ DO NOT add '.css': 'css' to the loader below
 * ❌ DO NOT add external: ['*.css']
 * ❌ DO NOT process CSS with esbuild in ANY way
 *
 * WHY: CSS is handled EXCLUSIVELY by Tailwind CLI (build:css).
 * Adding CSS processing here will corrupt dist/webview.css.
 *
 * WORKFLOW:
 * 1. Tailwind CLI: src/webview/main.css → dist/webview.css (17KB)
 * 2. esbuild: src/webview/index.tsx → dist/webview.js (JS ONLY)
 * 3. HTML loads CSS via <link> tag
 *
 * VALIDATION: scripts/validate-css.js runs after build
 */
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
    // NO CSS LOADER - handled by Tailwind CLI
    '.svg': 'dataurl',
  },
  metafile: production,
};

/**
 * Copy markdown prompt files to dist
 */
async function copyPrompts() {
  const srcDir = path.join(__dirname, 'src', 'prompts');
  const destDir = path.join(__dirname, 'dist', 'prompts');

  async function copyRecursive(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyRecursive(srcPath, destPath);
      } else if (entry.name.endsWith('.md')) {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  try {
    await copyRecursive(srcDir, destDir);
    console.log('[prompts] Markdown files copied to dist/prompts/');
  } catch (error) {
    console.error('[prompts] Failed to copy markdown files:', error);
    throw error;
  }
}

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

      // Copy markdown prompt files
      await copyPrompts();

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
