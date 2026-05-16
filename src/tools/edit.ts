/**
 * Edit tool - applies code patches using KORIX_PATCH format
 */

import { z } from 'zod';
import type { Tool, ToolContext, ToolResult } from '../harness/toolRegistry';
import { PatchApplier } from '../patch/applier';

const EditFileInputSchema = z.object({
  patches: z
    .string()
    .min(1)
    .describe('Patches in KORIX_PATCH format'),
});

type EditFileInput = z.infer<typeof EditFileInputSchema>;

interface EditFileOutput {
  appliedCount: number;
  errorCount: number;
  rollbackId: string;
  errors?: Array<{ file: string; error: string }>;
}

export const EditFileTool: Tool<EditFileInput, EditFileOutput> = {
  name: 'EditFile',
  description: `Apply code patches using KORIX_PATCH format.

Format:
<KORIX_PATCH file="path/to/file.ts">
<SEARCH>
exact code to find
</SEARCH>
<REPLACE>
new code to replace with
</REPLACE>
</KORIX_PATCH>

Multiple patches can be included in a single request.
All patches are applied atomically with automatic rollback on failure.`,

  schema: EditFileInputSchema,

  allowedInMode(mode: 'ask' | 'plan' | 'agent'): boolean {
    return mode === 'agent';
  },

  requiresApproval(_input: EditFileInput, _context: ToolContext): boolean {
    return true;
  },

  async execute(
    input: EditFileInput,
    context: ToolContext
  ): Promise<ToolResult<EditFileOutput>> {
    const startTime = Date.now();

    try {
      const applier = new PatchApplier(context.workspaceRoot);
      const result = await applier.applyPatches(input.patches);

      const output: EditFileOutput = {
        appliedCount: result.appliedPatches.length,
        errorCount: result.errors.length,
        rollbackId: '',
      };

      if (result.errors.length > 0) {
        output.errors = result.errors.map((e) => ({
          file: e.file,
          error: e.error,
        }));
      }

      if (result.appliedPatches.length > 0) {
        const rollbackPoints = applier.getRollbackManager().listRollbackPoints();
        const latestRollback = rollbackPoints[0];
        if (latestRollback) {
          output.rollbackId = latestRollback.id;
        }
      }

      return {
        success: result.success,
        data: output,
        error: result.success ? undefined : 'Some patches failed to apply',
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to apply patches: ${(error as Error).message}`,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: Date.now(),
        },
      };
    }
  },
};
