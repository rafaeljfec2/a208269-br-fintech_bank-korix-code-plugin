/**
 * Factory para criar mock de ToolContext em testes
 *
 * Uso:
 * ```typescript
 * const context = createMockToolContext();
 * const result = await tool.execute(input, context);
 * ```
 */

import type { ToolContext } from "../../harness/toolRegistry";
import type { ExecutionContext } from "../../core/types";

/**
 * Cria um mock completo de ToolContext para testes
 *
 * @param overrides - Propriedades para sobrescrever defaults
 * @returns ToolContext mock configurado
 */
export function createMockToolContext(
  overrides?: Partial<ToolContext>,
): ToolContext {
  const defaultExecution: ExecutionContext = {
    mode: "agent",
    workspaceRoot: "/test/workspace",
    openFiles: [],
  };

  return {
    workspaceRoot: "/test/workspace",
    execution: defaultExecution,
    userId: "test-user",
    ...overrides,
  };
}

/**
 * Cria um ToolContext mock com modo específico
 *
 * @param mode - Modo de execução (agent, interactive, etc.)
 * @returns ToolContext mock
 */
export function createMockToolContextWithMode(
  mode: ExecutionContext["mode"],
): ToolContext {
  return createMockToolContext({
    execution: {
      mode,
      workspaceRoot: "/test/workspace",
      openFiles: [],
    },
  });
}

/**
 * Cria um ToolContext mock com workspace root customizado
 *
 * @param workspaceRoot - Caminho do workspace root
 * @returns ToolContext mock
 */
export function createMockToolContextWithWorkspace(
  workspaceRoot: string,
): ToolContext {
  return createMockToolContext({ workspaceRoot });
}
