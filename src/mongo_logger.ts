import * as fs from 'fs';
import type { Writable } from 'stream';

import { getUint } from './connection_string';

/** @internal */
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

/** @internal */
export type SeverityLevel = typeof SeverityLevel[keyof typeof SeverityLevel];

/** @returns one of SeverityLevel or null if passsed severity is not a valid SeverityLevel */
function toValidSeverity(severity?: string): SeverityLevel | null {
  const validSeverities: string[] = Object.values(SeverityLevel);
  const lowerSeverity = severity?.toLowerCase();

  if (lowerSeverity != null && validSeverities.includes(lowerSeverity)) {
    return lowerSeverity as SeverityLevel;
  }

  return null;
}

/** @internal */
export const MongoLoggableComponent = Object.freeze({
  COMMAND: 'command',
  TOPOLOGY: 'topology',
  SERVER_SELECTION: 'serverSelection',
  CONNECTION: 'connection'
} as const);

/** @internal */
export type MongoLoggableComponent =
  typeof MongoLoggableComponent[keyof typeof MongoLoggableComponent];

/** @internal */
export interface MongoLoggerMongoClientOptions {
  mongodbLogPath?: string | Writable;
}

/** @internal */
export interface MongoLoggerOptions {
  /** Severity level for command component */
  command: SeverityLevel;
  /** Severity level for SDAM */
  topology: SeverityLevel;
  /** Severity level for server selection component */
  serverSelection: SeverityLevel;
  /** Severity level for CMAP */
  connection: SeverityLevel;
  /** Default severity level to be if any of the above are unset */
  defaultSeverity: SeverityLevel;
  /** Max length of embedded EJSON docs. Setting to 0 disables truncation. Defaults to 1000. */
  maxDocumentLength: number;
  /** Destination for log messages. Must be 'stderr', 'stdout', a file path, or a Writable. Defaults to 'stderr'. */
  logPath: string | Writable;
}

/** @internal */
export class MongoLogger {
  componentSeverities: Record<MongoLoggableComponent, SeverityLevel>;
  maxDocumentLength: number;
  logPath: Writable;

  constructor(options: MongoLoggerOptions) {
    // validate log path
    if (typeof options.logPath === 'string') {
      this.logPath =
        options.logPath === 'stderr' || options.logPath === 'stdout'
          ? process[options.logPath]
          : fs.createWriteStream(options.logPath, { flags: 'a+' });
      // TODO(NODE-4816): add error handling for creating a write stream
    } else {
      this.logPath = options.logPath;
    }

    this.componentSeverities = options;
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

  /**
   * Merges options set through environment variables and the MongoClient, preferring envariables
   * when both are set, and substituting defaults for values not set. Options set in constructor
   * take precedence over both environment variables and MongoClient options.
   *
   * When parsing component severity levels, invalid values are treated as unset and replaced with
   * the default severity.
   *
   * @param clientOptions - options set for the logger in the MongoClient options
   * @returns a MongoLoggerOptions object to be used when instantiating a new MongoLogger
   */
  static resolveOptions(clientOptions?: MongoLoggerMongoClientOptions): MongoLoggerOptions {
    const defaultSeverity = toValidSeverity(process.env.MONGODB_LOG_ALL) ?? SeverityLevel.OFF;

    return {
      command: toValidSeverity(process.env.MONGODB_LOG_COMMAND) ?? defaultSeverity,
      topology: toValidSeverity(process.env.MONGODB_LOG_TOPOLOGY) ?? defaultSeverity,
      serverSelection: toValidSeverity(process.env.MONGODB_LOG_SERVER_SELECTION) ?? defaultSeverity,
      connection: toValidSeverity(process.env.MONGODB_LOG_CONNECTION) ?? defaultSeverity,
      defaultSeverity,
      maxDocumentLength:
        typeof process.env.MONGODB_LOG_MAX_DOCUMENT_LENGTH === 'string' &&
        process.env.MONGODB_LOG_MAX_DOCUMENT_LENGTH !== ''
          ? getUint('MONGODB_LOG_MAX_DOCUMENT_LENGTH', process.env.MONGODB_LOG_MAX_DOCUMENT_LENGTH)
          : 1000,
      logPath:
        typeof process.env.MONGODB_LOG_PATH === 'string' && process.env.MONGODB_LOG_PATH !== ''
          ? process.env.MONGODB_LOG_PATH
          : clientOptions?.mongodbLogPath ?? 'stderr'
    };
  }
}
