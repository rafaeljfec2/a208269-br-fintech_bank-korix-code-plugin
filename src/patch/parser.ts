/**
 * Patch parser - parses KORIX_PATCH format
 */

import { getLogger } from '../telemetry/logger';
import type { Patch, PatchError } from './types';
import { PatchErrorReason as Reason } from './types';

export class PatchParser {
  private readonly patchRegex =
    /<KORIX_PATCH\s+file="([^"]+)"\s*>\s*<SEARCH>([\s\S]*?)<\/SEARCH>\s*<REPLACE>([\s\S]*?)<\/REPLACE>\s*<\/KORIX_PATCH>/g;

  parse(content: string): { patches: Patch[]; errors: PatchError[] } {
    const logger = getLogger();
    const patches: Patch[] = [];
    const errors: PatchError[] = [];

    let match;
    let matchCount = 0;

    while ((match = this.patchRegex.exec(content)) !== null) {
      matchCount++;
      const [, file, search, replace] = match;

      if (!file?.trim()) {
        errors.push({
          file: '<unknown>',
          error: 'File attribute is required',
          reason: Reason.PARSE_ERROR,
        });
        continue;
      }

      if (!search) {
        errors.push({
          file: file.trim(),
          error: 'SEARCH block cannot be empty',
          reason: Reason.PARSE_ERROR,
        });
        continue;
      }

      patches.push({
        file: file.trim(),
        search: this.normalizeWhitespace(search),
        replace: this.normalizeWhitespace(replace ?? ''),
      });

      logger.debug('Parsed patch', {
        file: file.trim(),
        searchLines: search.split('\n').length,
        replaceLines: (replace ?? '').split('\n').length,
      });
    }

    if (matchCount === 0) {
      errors.push({
        file: '<unknown>',
        error: 'No valid KORIX_PATCH blocks found',
        reason: Reason.PARSE_ERROR,
      });
    }

    logger.info('Patch parsing complete', {
      patches: patches.length,
      errors: errors.length,
    });

    return { patches, errors };
  }

  private normalizeWhitespace(text: string): string {
    return text
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim();
  }

  validate(patch: Patch): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!patch.file) {
      errors.push('File path is required');
    }

    if (!patch.search) {
      errors.push('SEARCH block is required');
    }

    if (patch.search === patch.replace) {
      errors.push('SEARCH and REPLACE are identical - no changes to apply');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  format(patch: Patch): string {
    return `<KORIX_PATCH file="${patch.file}">
<SEARCH>
${patch.search}
</SEARCH>
<REPLACE>
${patch.replace}
</REPLACE>
</KORIX_PATCH>`;
  }
}
