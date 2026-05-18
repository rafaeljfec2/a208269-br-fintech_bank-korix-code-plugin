/**
 * Markdown Post-Processor
 *
 * Transforms Claude's raw markdown responses into professional, polished output.
 *
 * Transformations:
 * 1. Strategic emoji injection (⛔ ✅ ❌ ⚠️ for hierarchy)
 * 2. List-to-table conversion (for comparisons)
 * 3. Structure enhancement (file paths as links)
 */

export interface ProcessingOptions {
  readonly addStrategicEmojis: boolean;
  readonly convertToTables: boolean;
  readonly enhanceStructure: boolean;
}

// Debug flag - enable via localStorage.setItem('KORIX_DEBUG_MARKDOWN', 'true')
const DEBUG = typeof window !== 'undefined' && localStorage?.getItem('KORIX_DEBUG_MARKDOWN') === 'true';

function debugLog(phase: string, data: unknown): void {
  if (DEBUG) {
    console.log(`[MarkdownPostProcessor] ${phase}:`, data);
  }
}

/**
 * Main post-processing pipeline
 */
export function postProcessMarkdown(
  rawMarkdown: string,
  options: ProcessingOptions
): string {
  debugLog('INPUT', {
    length: rawMarkdown.length,
    preview: rawMarkdown.slice(0, 200),
    options,
  });

  let processed = rawMarkdown;

  if (options.addStrategicEmojis) {
    const before = processed;
    processed = addStrategicEmojis(processed);
    debugLog('addStrategicEmojis', {
      changed: before !== processed,
      sample: processed.slice(0, 100),
    });
  }

  if (options.convertToTables) {
    const before = processed;
    processed = convertListsToTables(processed);
    const tableCount = (processed.match(/\|.*\|/g) ?? []).length;
    debugLog('convertToTables', {
      changed: before !== processed,
      tables: tableCount,
    });
  }

  if (options.enhanceStructure) {
    const before = processed;
    processed = enhanceStructure(processed);
    debugLog('enhanceStructure', {
      changed: before !== processed,
    });
  }

  debugLog('OUTPUT', {
    length: processed.length,
    preview: processed.slice(0, 200),
    sizeChange: processed.length - rawMarkdown.length,
  });

  return processed;
}

/**
 * Add strategic emojis to critical headers
 *
 * Patterns:
 * - CRITICAL/CRÍTICO → ⛔
 * - WARNING/AVISO/ATENÇÃO → ⚠️
 * - ERROR/ERRO → ❌
 * - SUCCESS/SUCESSO → ✅
 *
 * Also removes decorative emojis from non-signal headers.
 */
export function addStrategicEmojis(markdown: string): string {
  let processed = markdown;

  // Add strategic emojis to signal headers (only if not already present)
  const emojiMap: ReadonlyArray<[RegExp, string]> = [
    [/^(#{1,6})\s+(?!⛔\s+)(CRITICAL|CRÍTICO)/gim, '$1 ⛔ $2'],
    [/^(#{1,6})\s+(?!⚠️\s+)(WARNING|AVISO|ATENÇÃO|IMPORTANTE|IMPORTANT)/gim, '$1 ⚠️ $2'],
    [/^(#{1,6})\s+(?!❌\s+)(ERROR|ERRO)/gim, '$1 ❌ $2'],
    [/^(#{1,6})\s+(?!✅\s+)(SUCCESS|SUCESSO)/gim, '$1 ✅ $2'],
  ];

  for (const [pattern, replacement] of emojiMap) {
    processed = processed.replace(pattern, replacement);
  }

  // Remove decorative emojis from normal headers (not signal words)
  // Pattern: ## 🎯 Normal Header → ## Normal Header
  const decorativeEmojiPattern = /^(#{1,6})\s+[\u{1F300}-\u{1F9FF}]\s+(?!(CRITICAL|WARNING|ERROR|SUCCESS|IMPORTANTE|CRÍTICO|AVISO|ERRO|SUCESSO))/gimu;
  processed = processed.replace(decorativeEmojiPattern, '$1 ');

  return processed;
}

/**
 * Convert comparison lists to markdown tables
 *
 * Detects lists with pattern:
 * - **Name**: Description
 * - **Name**: Description
 * - **Name**: Description (3+ items)
 *
 * Converts to:
 * | Name | Description |
 * |------|-------------|
 * | Name | Description |
 */
export function convertListsToTables(markdown: string): string {
  // Split by code blocks to avoid processing code
  const parts = markdown.split(/(```[\s\S]*?```)/g);

  const processed = parts.map((part, index) => {
    // Skip code blocks (odd indices)
    if (index % 2 === 1) {
      return part;
    }

    // Detect comparison lists
    // Pattern: 3+ consecutive lines of "- **Name**: Description"
    const listPattern = /^(?:[ \t]*-\s+\*\*[^*]+\*\*:\s+.+\n?){3,}/gm;

    return part.replace(listPattern, (match, offset: number) => {
      const lines = match.trim().split('\n');

      // Extract name and description from each line
      const items: Array<{ name: string; description: string }> = [];

      for (const line of lines) {
        const itemMatch = line.match(/^[ \t]*-\s+\*\*([^*]+)\*\*:\s+(.+)$/);
        if (itemMatch) {
          items.push({
            name: itemMatch[1].trim(),
            description: itemMatch[2].trim(),
          });
        }
      }

      // Generate table only if we have 3+ valid items
      if (items.length < 3) {
        return match; // Return original if not enough items
      }

      // Get context before the list (last 200 chars) to infer header type
      const contextBefore = part.slice(Math.max(0, offset - 200), offset).toLowerCase();
      const contextHasMode = /\bmode(s)?\b/.test(contextBefore);
      const contextHasTool = /\btool(s)?\b/.test(contextBefore);
      const contextHasProvider = /\bprovider(s)?\b/.test(contextBefore);
      const contextHasCommand = /\bcommand(s)?\b/.test(contextBefore);

      // Detect header names from context (heuristic)
      const firstName = items[0]?.name ?? 'Item';

      // Check for common patterns in item names
      const hasMode = firstName.includes('Mode') || items.some(i => i.name.includes('Mode'));
      const hasTool = firstName.includes('Tool') || items.some(i => i.name.includes('Tool'));
      const hasProvider = firstName.includes('Provider') || items.some(i => i.name.includes('Provider'));
      const hasCommand = firstName.includes('Command') || items.some(i => i.name.includes('Command'));

      // Check for verb-based tool names (ReadFile, WriteFile, etc.)
      const verbPattern = /^(Read|Write|Edit|Get|Set|List|Create|Update|Delete|Run|Execute|Find|Search|Grep)/;
      const isProbablyTool = verbPattern.test(firstName) || firstName.includes('File');

      const headerLeft = hasMode || contextHasMode ? 'Mode' :
                         hasTool || isProbablyTool || contextHasTool ? 'Tool' :
                         hasProvider || contextHasProvider ? 'Provider' :
                         hasCommand || contextHasCommand ? 'Command' :
                         'Name';

      // Generate markdown table
      const tableLines = [
        `| ${headerLeft} | Description |`,
        '|------|-------------|',
        ...items.map(item => `| ${item.name} | ${item.description} |`),
        '', // Empty line after table
      ];

      return tableLines.join('\n');
    });
  }).join('');

  return processed;
}

/**
 * Enhance structure
 *
 * - Convert file paths to clickable links
 * - Clean up code block headers
 */
export function enhanceStructure(markdown: string): string {
  let processed = markdown;

  // Convert file paths to links (but not inside code blocks or inline code)
  // Pattern: src/path/to/file.ts → [src/path/to/file.ts](src/path/to/file.ts)
  // Avoid: `src/path/to/file.ts` (inline code)
  // Avoid: ```...src/path/to/file.ts...``` (code blocks)

  // Split by code blocks and inline code to avoid processing them
  const codeBlockPattern = /(```[\s\S]*?```|`[^`]+`)/g;
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockPattern.exec(processed)) !== null) {
    // Text before code
    parts.push(processed.slice(lastIndex, match.index));
    // Code (unchanged)
    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  // Remaining text
  parts.push(processed.slice(lastIndex));

  // Process only non-code parts (even indices)
  processed = parts.map((part, index) => {
    if (index % 2 === 1) {
      return part; // Code, don't process
    }

    // Convert file paths to links
    // Pattern: word boundary + path with / and extension
    const filePathPattern = /\b((?:src|dist|test|tests|lib|node_modules|\.claude)\/[a-zA-Z0-9_.\-/]+\.[a-z]{1,4})\b/g;

    return part.replace(filePathPattern, (match) => {
      // Don't convert if already in a markdown link
      const beforeMatch = part.slice(0, part.indexOf(match));
      if (beforeMatch.endsWith('[') || beforeMatch.endsWith('](')) {
        return match;
      }

      return `[${match}](${match})`;
    });
  }).join('');

  return processed;
}
