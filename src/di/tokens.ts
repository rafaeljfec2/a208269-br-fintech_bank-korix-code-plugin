/**
 * DI Tokens for service identification
 */

// Core services
export const TOKENS = {
  // Logger
  Logger: Symbol('Logger'),

  // Context
  WorkspaceIndexer: Symbol('WorkspaceIndexer'),
  HeuristicRanker: Symbol('HeuristicRanker'),
  ContextBuilder: Symbol('ContextBuilder'),
  ContextEngine: Symbol('ContextEngine'),

  // Terminal
  SessionManager: Symbol('SessionManager'),
  CommandRunner: Symbol('CommandRunner'),

  // Patch
  PatchParser: Symbol('PatchParser'),
  PatchValidator: Symbol('PatchValidator'),
  RollbackManager: Symbol('RollbackManager'),
  PatchApplier: Symbol('PatchApplier'),

  // Tools
  ToolRegistry: Symbol('ToolRegistry'),
  PermissionManager: Symbol('PermissionManager'),

  // Providers
  ProviderRegistry: Symbol('ProviderRegistry'),
  ProviderConfigManager: Symbol('ProviderConfigManager'),

  // Configuration
  WorkspaceRoot: Symbol('WorkspaceRoot'),
  ExtensionContext: Symbol('ExtensionContext'),

  // Runtime
  RuntimeEventEmitter: Symbol('RuntimeEventEmitter'),
  RuntimeMetrics: Symbol('RuntimeMetrics'),
  RuntimeStateManager: Symbol('RuntimeStateManager'),
  CheckpointManager: Symbol('CheckpointManager'),
  RecoveryManager: Symbol('RecoveryManager'),
  IterationGuard: Symbol('IterationGuard'),
  CancellationManager: Symbol('CancellationManager'),
  TaskQueue: Symbol('TaskQueue'),
  ExecutionEngine: Symbol('ExecutionEngine'),
  AgentLoop: Symbol('AgentLoop'),
} as const;

export type TokenType = (typeof TOKENS)[keyof typeof TOKENS];
