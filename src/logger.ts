/** @public */
export const LoggerLevel = Object.freeze({
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug'
} as const);

/** @public */
export type LoggerLevel = typeof LoggerLevel[keyof typeof LoggerLevel];

/** @public */
export type LoggerFunction = (message?: any, ...optionalParams: any[]) => void;

/** @public */
export interface LoggerOptions {
  logger?: LoggerFunction;
  loggerLevel?: LoggerLevel;
}
