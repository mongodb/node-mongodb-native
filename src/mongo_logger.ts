import * as fs from 'fs';
import { env } from 'process';
import type { Writable } from 'stream';

import { getUint } from './connection_string';

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

/** @returns one of SeverityLevel or null if it is not a valid SeverityLevel */
function toValidSeverity(severity?: string): SeverityLevel | null {
  const validSeverities: string[] = Object.values(SeverityLevel);
  const lowerSeverity = severity?.toLowerCase();

  if (lowerSeverity != null && validSeverities.includes(lowerSeverity)) {
    return lowerSeverity as SeverityLevel;
  }

  return null;
}

/** @internal */
export const LoggableComponent = Object.freeze({
  COMMAND: 'command',
  TOPOLOGY: 'topology',
  SERVER_SELECTION: 'serverSelection',
  CONNECTION: 'connection'
} as const);

/** @internal */
type LoggableComponent = typeof LoggableComponent[keyof typeof LoggableComponent];

/** @internal */
export interface LoggerMongoClientOptions {
  mongodbLogPath?: string | Writable;
}

/** @public */
export interface LoggerOptions {
  command: SeverityLevel;
  topology: SeverityLevel;
  serverSelection: SeverityLevel;
  connection: SeverityLevel;
  defaultSeverity: SeverityLevel;
  maxDocumentLength: number;
  logPath: string | Writable;
}

/**
 * @internal
 * TODO(andymina): add docs
 */
export class Logger {
  /** @internal */
  componentSeverities: Record<LoggableComponent, SeverityLevel>;
  maxDocumentLength: number;
  logPath: Writable;

  constructor(options: LoggerOptions) {
    // validate log path
    if (typeof options.logPath === 'string') {
      this.logPath =
        options.logPath === 'stderr' || options.logPath === 'stdout'
          ? process[options.logPath]
          : fs.createWriteStream(options.logPath, { flags: 'a+' });
    } else {
      this.logPath = options.logPath;
    }

    // extract comp severities
    this.componentSeverities = options;

    // fill max doc length
    this.maxDocumentLength = options.maxDocumentLength;
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  /* eslint-disable @typescript-eslint/no-empty-function */
  emergency(component: any, message: any): void {}

  alert(component: any, message: any): void {}

  critical(component: any, message: any): void {}

  error(component: any, message: any): void {}

  warn(component: any, message: any): void {}

  notice(component: any, message: any): void {}

  info(component: any, message: any): void {}

  debug(component: any, message: any): void {}

  trace(component: any, message: any): void {}

  static resolveOptions(clientOptions?: LoggerMongoClientOptions): LoggerOptions {
    const defaultSeverity = toValidSeverity(env.MONGODB_LOG_ALL) ?? SeverityLevel.OFF;

    return {
      command: toValidSeverity(env.MONGODB_LOG_COMMAND) ?? defaultSeverity,
      topology: toValidSeverity(env.MONGODB_LOG_TOPOLOGY) ?? defaultSeverity,
      serverSelection: toValidSeverity(env.MONGODB_LOG_SERVER_SELECTION) ?? defaultSeverity,
      connection: toValidSeverity(env.MONGODB_LOG_CONNECTION) ?? defaultSeverity,
      defaultSeverity,
      maxDocumentLength:
        typeof env.MONGODB_LOG_MAX_DOCUMENT_LENGTH === 'string' &&
        env.MONGODB_LOG_MAX_DOCUMENT_LENGTH !== ''
          ? getUint('MONGODB_LOG_MAX_DOCUMENT_LENGTH', env.MONGODB_LOG_MAX_DOCUMENT_LENGTH)
          : 1000,
      logPath:
        typeof env.MONGODB_LOG_PATH === 'string' && env.MONGODB_LOG_PATH !== ''
          ? env.MONGODB_LOG_PATH
          : clientOptions?.mongodbLogPath ?? 'stderr'
    };
  }
}
