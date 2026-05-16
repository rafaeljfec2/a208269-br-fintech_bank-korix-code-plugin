#!/usr/bin/env node
/**
 * CSS Build Validation - Prevents CSS corruption
 *
 * Validates that dist/webview.css contains Tailwind classes
 * and has not been overwritten by esbuild or other tools.
 *
 * CRITICAL: This script MUST pass before deployment.
 */

import { readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const cssPath = join(projectRoot, 'dist', 'webview.css');

const MIN_SIZE_KB = 10; // Minimum expected size (Tailwind + xterm should be ~17KB)
const REQUIRED_CLASSES = [
  '.flex{',           // Tailwind utility
  '.h-screen{',       // Tailwind utility
  '.xterm{',          // xterm.js styles
  '--tw-',            // Tailwind CSS variables
];
const FORBIDDEN_PATTERNS = [
  '@tailwind base',   // Unprocessed Tailwind directive
  '@tailwind components',
  '@tailwind utilities',
];

console.log('🔍 Validating CSS build...\n');

// Check file exists
try {
  statSync(cssPath);
} catch (error) {
  console.error('❌ CRITICAL: dist/webview.css not found!');
  console.error('   Run: pnpm run compile');
  process.exit(1);
}

// Check file size
const stats = statSync(cssPath);
const sizeKB = stats.size / 1024;

if (sizeKB < MIN_SIZE_KB) {
  console.error(`❌ CRITICAL: CSS file too small (${sizeKB.toFixed(1)}KB < ${MIN_SIZE_KB}KB)`);
  console.error('   This indicates Tailwind CSS was not processed correctly.');
  console.error('   The CSS may have been overwritten by esbuild.');
  console.error('\n   Fix:');
  console.error('   1. Ensure main.css has @import for xterm');
  console.error('   2. Ensure NO React components import CSS files');
  console.error('   3. Ensure esbuild.config.js does NOT have CSS loader');
  process.exit(1);
}

// Check content
const content = readFileSync(cssPath, 'utf-8');

// Check for forbidden patterns (unprocessed Tailwind)
for (const pattern of FORBIDDEN_PATTERNS) {
  if (content.includes(pattern)) {
    console.error(`❌ CRITICAL: Found unprocessed Tailwind directive: "${pattern}"`);
    console.error('   Tailwind CSS was not compiled correctly.');
    console.error('   The build:css step may have failed or been skipped.');
    process.exit(1);
  }
}

// Check for required classes
const missingClasses = REQUIRED_CLASSES.filter(cls => !content.includes(cls));

if (missingClasses.length > 0) {
  console.error('❌ CRITICAL: Missing required CSS classes:');
  missingClasses.forEach(cls => console.error(`   - ${cls}`));
  console.error('\n   This indicates the CSS was corrupted or overwritten.');
  console.error('   Expected Tailwind utilities and xterm styles are missing.');
  process.exit(1);
}

// All checks passed
console.log('✅ CSS file size:', `${sizeKB.toFixed(1)}KB (>= ${MIN_SIZE_KB}KB)`);
console.log('✅ Tailwind directives processed');
console.log('✅ All required classes present:');
REQUIRED_CLASSES.forEach(cls => console.log(`   - ${cls.substring(0, 20)}...`));
console.log('\n🎉 CSS build validation PASSED\n');
