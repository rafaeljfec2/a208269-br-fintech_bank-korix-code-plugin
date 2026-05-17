/**
 * Types for patch system
 */

export interface Patch {
  file: string;
  search: string;
  replace: string;
}

export interface PatchResult {
  success: boolean;
  appliedPatches: AppliedPatch[];
  errors: PatchError[];
}

export interface AppliedPatch {
  file: string;
  search: string;
  replace: string;
  lineNumber: number;
  timestamp: number;
}

export interface PatchError {
  file: string;
  error: string;
  reason: PatchErrorReason;
}

export enum PatchErrorReason {
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  SEARCH_NOT_FOUND = "SEARCH_NOT_FOUND",
  SEARCH_AMBIGUOUS = "SEARCH_AMBIGUOUS",
  PARSE_ERROR = "PARSE_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  CONFLICT = "CONFLICT",
  WRITE_ERROR = "WRITE_ERROR",
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConflictInfo {
  file: string;
  currentContent: string;
  expectedContent: string;
  timestamp: number;
}

export interface RollbackPoint {
  id: string;
  patches: AppliedPatch[];
  timestamp: number;
  fileBackups: Map<string, string>;
}
