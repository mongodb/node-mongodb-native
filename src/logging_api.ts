import * as fs from 'fs';
import type { WritableStream } from 'stream/web';

/** @public */
export const SeverityLevel = Object.freeze({
  EMERGENCY: 'emergency',
  ALERT: 'alert',
  CRITICAL: 'critical',
  ERROR: 'error',
  WARNING: 'warn',
  NOTICE: 'notice',
  INFORMATIONAL: 'info',
  DEBUG: 'debug',
  TRACE: 'trace',
  OFF: 'off'
} as const);

/** @public */
export type SeverityLevel = typeof SeverityLevel[keyof typeof SeverityLevel];

/** @internal */
const LoggableComponent = Object.freeze({
  COMMAND: 'command',
  TOPOLOGY: 'topology',
  SERVER_SELECTION: 'serverSelection',
  CONNECTION: 'connection'
});

/** @internal */
type LoggableComponent = typeof LoggableComponent[keyof typeof LoggableComponent];

/** @public */
export interface LoggerOptions {
  MONGODB_LOG_COMMAND?: SeverityLevel;
  MONGODB_LOG_TOPOLOGY?: SeverityLevel;
  MONGODB_LOG_SERVER_SELECTION?: SeverityLevel;
  MONGODB_LOG_CONNECTION?: SeverityLevel;
  MONGODB_LOG_ALL?: SeverityLevel;
  MONGODB_LOG_MAX_DOCUMENT_LENGTH?: number;

  /**
   * TODO(andymina): make this a WritableStream only when used within the class.
   * the i can always call .getWriter().write();
   */
  MONGODB_LOG_PATH?: string | WritableStream;
}

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */
/** @public */
export class Logger {
  /** @internal */
  componentSeverities: Map<LoggableComponent, SeverityLevel>;
  options: LoggerOptions;

  constructor(options: LoggerOptions) {
    // validate log path
    if (typeof options.MONGODB_LOG_PATH === 'string' && options.MONGODB_LOG_PATH !== 'stderr' && options.MONGODB_LOG_PATH !== 'stdout') {
      fs.createWriteStream(options.MONGODB_LOG_PATH, { flags: 'a+' });
    }
    
  }

  emergency(component: any, message: any): void {}

  alert(component: any, message: any): void {}

  critical(component: any, message: any): void {}

  error(component: any, message: any): void {}

  warn(component: any, message: any): void {}

  notice(component: any, message: any): void {}

  info(component: any, message: any): void {}

  debug(component: any, message: any): void {}

  trace(component: any, message: any): void {}

  #validateOptions(): void {
    if 
  }
}

/**
  MONGODB_LOG_COMMAND
  MONGODB_LOG_TOPOLOGY
  MONGODB_LOG_SERVER_SELECTION
  MONGODB_LOG_CONNECTION
  MONGODB_LOG_ALL
  MONGODB_LOG_MAX_DOCUMENT_LENGTH
  MONGODB_LOG_PATH
 */
