/**
 * Centralized logging system using Pino
 */

import pino from "pino";
import type * as vscode from "vscode";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerOptions {
  level?: LogLevel;
  outputChannel?: vscode.OutputChannel;
  enablePrettyPrint?: boolean;
}

export class Logger {
  private pino: pino.Logger;
  private outputChannel?: vscode.OutputChannel;

  constructor(options: LoggerOptions = {}) {
    this.outputChannel = options.outputChannel;

    const pinoOptions: pino.LoggerOptions = {
      level: options.level ?? "info",
      browser: {
        asObject: true,
      },
    };

    if (options.enablePrettyPrint && process.env.NODE_ENV !== "production") {
      this.pino = pino({
        ...pinoOptions,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      });
    } else {
      this.pino = pino(pinoOptions);
    }
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("debug", message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log("info", message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("warn", message, metadata);
  }

  error(
    message: string,
    error?: Error | unknown,
    metadata?: Record<string, unknown>,
  ): void {
    const enrichedMetadata = {
      ...metadata,
      ...(error instanceof Error
        ? {
            error: {
              message: error.message,
              stack: error.stack,
              name: error.name,
            },
          }
        : error
          ? { error }
          : {}),
    };

    this.log("error", message, enrichedMetadata);
  }

  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    const logData = metadata ? { ...metadata, message } : { message };

    switch (level) {
      case "debug":
        this.pino.debug(logData);
        break;
      case "info":
        this.pino.info(logData);
        break;
      case "warn":
        this.pino.warn(logData);
        break;
      case "error":
        this.pino.error(logData);
        break;
    }

    if (this.outputChannel) {
      const timestamp = new Date().toISOString();
      const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : "";
      const levelStr = level.toUpperCase().padEnd(5);
      this.outputChannel.appendLine(
        `[${timestamp}] ${levelStr} ${message}${metaStr}`,
      );
    }
  }

  setLevel(level: LogLevel): void {
    this.pino.level = level;
  }

  child(bindings: Record<string, unknown>): Logger {
    const childLogger = new Logger({
      level: this.pino.level as LogLevel,
      outputChannel: this.outputChannel,
    });
    childLogger.pino = this.pino.child(bindings);
    return childLogger;
  }
}

let globalLogger: Logger | null = null;

export function initializeLogger(options: LoggerOptions): Logger {
  globalLogger = new Logger(options);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    throw new Error("Logger not initialized. Call initializeLogger() first.");
  }
  return globalLogger;
}
