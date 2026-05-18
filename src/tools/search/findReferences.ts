/**
 * FindReferences Tool - LSP-based reference finding
 *
 * Performance target: < 1s for 1000 references
 *
 * Uses VSCode Language Server Protocol:
 * - vscode.executeReferenceProvider
 * - Language server does the heavy lifting
 * - Zero setup required
 */

import * as vscode from "vscode";
import * as path from "path";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../../harness/toolRegistry";

const FindReferencesSchema = z.object({
  file: z.string().describe("File path (absolute or relative)"),
  line: z.number().describe("Line number (0-indexed)"),
  column: z.number().describe("Column number (0-indexed)"),
  includeDeclaration: z
    .boolean()
    .optional()
    .describe("Include the declaration itself (default: true)"),
});

type FindReferencesInput = z.infer<typeof FindReferencesSchema>;

interface Reference {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly text: string; // Line text containing the reference
}

/**
 * Find all references using VSCode LSP
 *
 * Algorithm:
 * 1. Resolve file path (absolute)
 * 2. Open document (if not already open)
 * 3. Execute vscode.executeReferenceProvider at position
 * 4. Parse Location[] results
 * 5. Return structured references
 */
export const FindReferencesTool: Tool<FindReferencesInput, Reference[]> = {
  name: "FindReferences",
  description: "Find all references to a symbol using LSP",
  schema: FindReferencesSchema,

  allowedInMode(_mode): boolean {
    return true; // Allowed in all modes
  },

  async execute(
    input: FindReferencesInput,
    context: ToolContext,
  ): Promise<ToolResult<Reference[]>> {
    const startTime = Date.now();

    try {
      const references = await findReferences(input, context.workspaceRoot);

      return {
        success: true,
        data: references,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    }
  },
};

/**
 * Find references using VSCode LSP
 */
async function findReferences(
  input: FindReferencesInput,
  workspaceRoot: string,
): Promise<Reference[]> {
  // Resolve absolute path
  const absolutePath = path.isAbsolute(input.file)
    ? input.file
    : path.join(workspaceRoot, input.file);

  const uri = vscode.Uri.file(absolutePath);

  // Open document (required for reference provider)
  await vscode.workspace.openTextDocument(uri);

  // Create position
  const position = new vscode.Position(input.line, input.column);

  // Execute reference provider
  const locations = await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeReferenceProvider",
    uri,
    position,
  );

  if (!locations || locations.length === 0) {
    return [];
  }

  // Convert Location[] to Reference[]
  const references: Reference[] = [];

  for (const location of locations) {
    const refDoc = await vscode.workspace.openTextDocument(location.uri);
    const range = location.range;

    // Get line text
    const lineText = refDoc.lineAt(range.start.line).text;

    references.push({
      file: location.uri.fsPath,
      line: range.start.line,
      column: range.start.character,
      endLine: range.end.line,
      endColumn: range.end.character,
      text: lineText.trim(),
    });
  }

  // Filter out declaration if requested
  if (input.includeDeclaration === false) {
    // The first reference is often the declaration
    // We can filter by checking if it's in the same file at the same position
    return references.filter(
      (ref) =>
        !(
          ref.file === absolutePath &&
          ref.line === input.line &&
          ref.column === input.column
        ),
    );
  }

  return references;
}
