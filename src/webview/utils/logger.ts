/**
 * Centralized logging for Korix Webview
 * All logs are prefixed with [Korix Webview] for easy filtering
 */

const PREFIX = "[Korix Webview]";

export const logger = {
  log: (...args: unknown[]) => console.log(PREFIX, ...args),
  info: (...args: unknown[]) => console.info(PREFIX, ...args),
  warn: (...args: unknown[]) => console.warn(PREFIX, ...args),
  error: (...args: unknown[]) => console.error(PREFIX, ...args),
  debug: (...args: unknown[]) => console.debug(PREFIX, ...args),
};
