# CSS Build System - Protection Against Corruption

**STATUS**: ✅ Protected with automatic validation

## The Problem We Solved

The webview CSS was being corrupted because esbuild was processing CSS imports from React components, overwriting the Tailwind-compiled CSS. This resulted in:

- Unprocessed `@tailwind` directives in production CSS
- Missing Tailwind utility classes
- File size dropping from 17KB → 4KB
- Broken webview styling

## The Solution (CURRENT WORKFLOW)

### 1. Single Source of Truth: `src/webview/main.css`

All CSS imports happen in **one place only**:

```css
/* src/webview/main.css */

/**
 * Import external CSS libraries here
 * (e.g., xterm, other libraries)
 */
@import 'xterm/css/xterm.css';

/**
 * Tailwind directives
 * Processed by Tailwind CLI
 */
@tailwind base;
@tailwind components;
@tailwind utilities;

/**
 * Custom CSS below
 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
```

### 2. Tailwind CLI Processes Everything

```bash
# Command: pnpm run build:css
tailwindcss -i src/webview/main.css -o dist/webview.css --minify
```

**What happens:**
1. Reads `src/webview/main.css`
2. Resolves `@import 'xterm/css/xterm.css'`
3. Processes `@tailwind` directives → generates utility classes
4. Writes complete CSS to `dist/webview.css` (~17KB)

### 3. esbuild Bundles JS Only

```bash
# Command: node esbuild.config.js --production
```

**What happens:**
1. Reads `src/webview/index.tsx`
2. Bundles React app → `dist/webview.js`
3. **Does NOT process CSS** (no CSS loader configured)
4. **Does NOT touch** `dist/webview.css`

### 4. HTML Loads CSS Directly

```html
<!-- src/ui/providers/webviewProvider.ts -->
<link href="${styleUri}" rel="stylesheet">
```

The HTML references `dist/webview.css` directly. No bundling required.

### 5. Automatic Validation

```bash
# Command: node scripts/validate-css.js
# Runs automatically after every compile
```

**Checks:**
- ✅ File exists: `dist/webview.css`
- ✅ Size >= 10KB (indicates Tailwind processed)
- ✅ Contains Tailwind classes: `.flex{`, `.h-screen{`, etc
- ✅ Contains xterm styles: `.xterm{`
- ❌ No unprocessed directives: `@tailwind base`

**Result:** Build FAILS if CSS is corrupted.

## Protected Files

### `src/webview/main.css`

**Purpose:** Single source for all CSS imports and Tailwind directives

**Rules:**
- ✅ Add `@import` for external libraries
- ✅ Keep Tailwind directives
- ❌ Never remove this file
- ❌ Never bypass Tailwind CLI

**Warning comment added:**
```css
/**
 * CRITICAL CSS BUILD FILE - DO NOT MODIFY WITHOUT UNDERSTANDING
 * ...detailed rules...
 */
```

### `esbuild.config.js`

**Purpose:** JavaScript bundler (NOT CSS processor)

**Rules:**
- ❌ Never add `'.css': 'css'` to loader
- ❌ Never add `external: ['*.css']`
- ❌ Never configure CSS processing

**Warning comment added:**
```javascript
/**
 * CRITICAL: CSS HANDLING RULES
 * DO NOT add CSS loader
 * ...detailed explanation...
 */
```

### `scripts/validate-css.js`

**Purpose:** Automatic validation after every build

**Enforces:**
- Minimum file size (10KB)
- Required CSS classes present
- No unprocessed Tailwind directives

**Integrated into:**
```json
{
  "scripts": {
    "compile": "npm run build:css && node esbuild.config.js && npm run validate:css"
  }
}
```

## React Component Rules

### ❌ FORBIDDEN: CSS Imports in Components

```tsx
// ❌ NEVER DO THIS
import './styles.css';
import 'some-library/dist/styles.css';
```

**Why:** Makes esbuild process CSS, corrupting `dist/webview.css`

### ✅ ALLOWED: Inline Styles (Emergency Only)

```tsx
// ✅ OK for one-off styles
<div style={{ padding: '20px' }}>...</div>
```

**Better:** Use Tailwind classes

```tsx
// ✅ PREFERRED
<div className="p-5">...</div>
```

### ✅ ALLOWED: Tailwind Classes

```tsx
// ✅ ALWAYS USE TAILWIND
<div className="flex h-screen bg-[var(--vscode-editor-background)]">
  <button className="px-4 py-2 hover:opacity-80">Click</button>
</div>
```

## Adding New CSS Libraries

### Example: Adding a new chart library

1. **Install the package:**
   ```bash
   pnpm add chart-library
   ```

2. **Add import to `main.css`:**
   ```css
   /* src/webview/main.css */
   @import 'xterm/css/xterm.css';
   @import 'chart-library/dist/chart.css'; /* NEW */
   
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```

3. **Rebuild and validate:**
   ```bash
   pnpm run compile
   # Validation runs automatically
   ```

4. **Verify:**
   ```bash
   ls -lh dist/webview.css  # Size should increase
   grep "chart-library-class" dist/webview.css  # Verify classes
   ```

### ❌ DON'T: Import in Component

```tsx
// ❌ NEVER
import 'chart-library/dist/chart.css';
import Chart from 'chart-library';
```

### ✅ DO: Import in main.css

```css
/* ✅ CORRECT */
@import 'chart-library/dist/chart.css';
```

## Troubleshooting

### CSS file is 4KB instead of 17KB

**Cause:** esbuild processed CSS and overwrote Tailwind output

**Fix:**
1. Check for CSS imports in `.tsx` files:
   ```bash
   grep -r "import.*\.css" src/webview/ --include="*.tsx"
   ```
2. Remove any CSS imports found
3. Add imports to `src/webview/main.css` instead
4. Rebuild: `pnpm run compile`

### Validation fails: "Missing required classes"

**Cause:** Tailwind CLI didn't run or failed silently

**Fix:**
1. Run Tailwind manually:
   ```bash
   pnpm run build:css
   ```
2. Check for errors in output
3. Verify `dist/webview.css` has Tailwind classes
4. Run full compile: `pnpm run compile`

### Validation fails: "Found unprocessed directive"

**Cause:** `dist/webview.css` contains literal `@tailwind` directives

**Fix:**
1. Check `esbuild.config.js` - ensure NO CSS loader
2. Clean build:
   ```bash
   rm -rf dist/
   pnpm run compile
   ```

### Webview is blank/unstyled

**Possible causes:**
1. CSS not loaded (check DevTools Network tab)
2. CSS corrupted (run `pnpm run validate:css`)
3. CSP blocking styles (check Console errors)

**Debug:**
```bash
# 1. Validate CSS
pnpm run validate:css

# 2. Check CSS size
ls -lh dist/webview.css

# 3. Inspect first 200 chars
head -c 200 dist/webview.css

# Should see Tailwind CSS, NOT @tailwind directives
```

## CI/CD Integration

The validation script is designed for CI pipelines:

```yaml
# .github/workflows/build.yml
- name: Build Extension
  run: pnpm run compile
  # Fails automatically if CSS validation fails

- name: Verify CSS (explicit check)
  run: pnpm run validate:css
```

**Exit codes:**
- `0` = CSS valid
- `1` = CSS corrupted (build should fail)

## Summary: What Changed

### Before (BROKEN)

```
src/webview/index.tsx:
  import './main.css'  ❌

src/webview/components/terminal/TerminalPanel.tsx:
  import 'xterm/css/xterm.css'  ❌

esbuild.config.js:
  loader: { '.css': 'css' }  ❌

Result: esbuild overwrites CSS → 4KB corrupted file
```

### After (PROTECTED)

```
src/webview/main.css:
  @import 'xterm/css/xterm.css'  ✅
  @tailwind base;  ✅

src/webview/*.tsx:
  NO CSS imports  ✅

esbuild.config.js:
  NO CSS loader  ✅

scripts/validate-css.js:
  Automatic validation  ✅

Result: Tailwind CLI generates CSS → 17KB valid file
```

## Maintenance

This system requires **zero maintenance** once set up correctly.

**Only modify CSS build if:**
- Adding new CSS library → update `main.css`
- Customizing Tailwind config → update `tailwind.config.js`

**Never modify:**
- `scripts/validate-css.js` (unless validation rules change)
- `esbuild.config.js` CSS handling (keep it NOT processing CSS)

---

**Last Updated:** 2026-05-16  
**Status:** ✅ Protected with automatic validation  
**Validation:** `pnpm run validate:css`
