/**
 * Factory para criar mocks de child_process para testes
 *
 * Uso:
 * ```typescript
 * import { spawn } from "child_process";
 * vi.mock("child_process");
 *
 * const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;
 * mockSpawn.mockReturnValue(createMockProcess(0, "output\n"));
 * ```
 */

import { EventEmitter } from "events";
import { vi } from "vitest";

export interface MockProcessOptions {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  delay?: number; // ms to delay before emitting
  signal?: string; // Signal to emit (e.g., "SIGTERM")
}

/**
 * Cria um mock de ChildProcess com comportamento customizável
 *
 * @param options - Configuração do processo mock
 * @returns Mock de ChildProcess compatível com spawn()
 */
export function createMockProcess(
  exitCode = 0,
  stdout = "",
  stderr = "",
): ReturnType<typeof createMockProcessWithOptions> {
  return createMockProcessWithOptions({ exitCode, stdout, stderr });
}

/**
 * Cria um mock de ChildProcess com opções avançadas
 *
 * @param options - Configuração completa do processo
 * @returns Mock de ChildProcess
 */
export function createMockProcessWithOptions(options: MockProcessOptions): {
  stdout: EventEmitter;
  stderr: EventEmitter;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  kill: ReturnType<typeof vi.fn>;
  pid?: number;
} {
  const { exitCode = 0, stdout = "", stderr = "", delay = 0, signal } = options;

  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  const processEmitter = new EventEmitter();

  // Simula comportamento assíncrono
  setTimeout(() => {
    // Emite stdout se fornecido
    if (stdout) {
      // Divide em chunks para simular streaming
      const chunks = stdout.split("\n");
      for (const chunk of chunks) {
        if (chunk) {
          stdoutEmitter.emit("data", Buffer.from(chunk + "\n"));
        }
      }
    }
    stdoutEmitter.emit("end");

    // Emite stderr se fornecido
    if (stderr) {
      stderrEmitter.emit("data", Buffer.from(stderr));
    }
    stderrEmitter.emit("end");

    // Emite close event
    if (signal) {
      processEmitter.emit("close", null, signal);
    } else {
      processEmitter.emit("close", exitCode);
    }

    processEmitter.emit("exit", exitCode);
  }, delay);

  return {
    stdout: stdoutEmitter,
    stderr: stderrEmitter,
    on: (event: string, callback: (...args: unknown[]) => void) => {
      processEmitter.on(event, callback);
    },
    kill: vi.fn(),
    pid: 12345,
  };
}

/**
 * Cria um mock de processo que falha imediatamente
 *
 * @param error - Mensagem de erro
 * @returns Mock de processo que emite erro
 */
export function createMockProcessWithError(error: string) {
  return createMockProcessWithOptions({
    exitCode: 1,
    stderr: error,
  });
}

/**
 * Cria um mock de processo para ripgrep JSON output
 *
 * @param matches - Array de matches para retornar
 * @returns Mock de processo com output JSON
 */
export function createMockRipgrepProcess(
  matches: Array<{
    path: string;
    line_number: number;
    lines: { text: string };
  }>,
) {
  const jsonLines = matches
    .map((match) =>
      JSON.stringify({
        type: "match",
        data: {
          path: { text: match.path },
          line_number: match.line_number,
          lines: match.lines,
        },
      }),
    )
    .join("\n");

  return createMockProcess(0, jsonLines);
}

/**
 * Cria um mock de processo para git porcelain v2 output
 *
 * @param files - Array de arquivos com status
 * @returns Mock de processo com output git
 */
export function createMockGitProcess(
  files: Array<{
    status: string;
    path: string;
    oldPath?: string;
  }>,
) {
  const lines = files.map((file) => {
    if (file.status === "renamed" && file.oldPath) {
      return `R100 ${file.oldPath}\t${file.path}`;
    }
    return `${file.status}\t${file.path}`;
  });

  return createMockProcess(0, lines.join("\n"));
}
