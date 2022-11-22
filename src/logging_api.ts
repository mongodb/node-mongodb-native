import * as fs from 'fs';
import type { Writable } from 'stream';

import { MongoInvalidArgumentError } from './error';

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
export const LoggableComponent = Object.freeze({
  COMMAND: 'command',
  TOPOLOGY: 'topology',
  SERVER_SELECTION: 'serverSelection',
  CONNECTION: 'connection'
} as const);

/** @internal */
type LoggableComponent = typeof LoggableComponent[keyof typeof LoggableComponent];

/** @public */
export interface LoggerMongoClientOptions {
  mongodbLogPath?: string | Writable;
}

/** @public */
export interface LoggerOptions {
  commandSeverity: SeverityLevel;
  topologySeverity: SeverityLevel;
  serverSelectionSeverity: SeverityLevel;
  connectionSeverity: SeverityLevel;
  defaultSeverity: SeverityLevel;
  maxDocumentLength: number;
  logDestination: string | Writable;
}

/**
 * @public
 * TODO(andymina): add docs for this
 */
export function extractLoggerOptions(clientOptions?: LoggerMongoClientOptions): LoggerOptions {
  const validSeverities = Object.values(SeverityLevel);

  return {
    commandSeverity:
      validSeverities.find(severity => severity === process.env.MONGODB_LOG_COMMAND) ??
      SeverityLevel.OFF,
    topologySeverity:
      validSeverities.find(severity => severity === process.env.MONGODB_LOG_TOPOLOGY) ??
      SeverityLevel.OFF,
    serverSelectionSeverity:
      validSeverities.find(severity => severity === process.env.MONGODB_LOG_SERVER_SELECTION) ??
      SeverityLevel.OFF,
    connectionSeverity:
      validSeverities.find(severity => severity === process.env.MONGODB_LOG_CONNECTION) ??
      SeverityLevel.OFF,
    defaultSeverity:
      validSeverities.find(severity => severity === process.env.MONGODB_LOG_COMMAND) ??
      SeverityLevel.OFF,
    maxDocumentLength:
      typeof process.env.MONGODB_LOG_MAX_DOCUMENT_LENGTH === 'string'
        ? Number.parseInt(process.env.MONGODB_LOG_MAX_DOCUMENT_LENGTH)
        : 1000,
    logDestination:
      typeof process.env.MONGODB_LOG_PATH === 'string'
        ? process.env.MONGODB_LOG_PATH
        : clientOptions?.mongodbLogPath ?? 'stderr'
  };
}

/** @public */
export class Logger {
  /** @internal */
  componentSeverities: Map<LoggableComponent, SeverityLevel> = new Map();
  maxDocumentLength: number;
  logDestination: Writable;

  constructor(options: LoggerOptions) {
    // validate log path
    if (typeof options.logDestination === 'string') {
      this.logDestination =
        options.logDestination === 'stderr' || options.logDestination === 'stdout'
          ? process[options.logDestination]
          : fs.createWriteStream(options.logDestination, { flags: 'a+' });
    } else {
      this.logDestination = options.logDestination;
    }

    // fill component severities
    this.componentSeverities.set(
      LoggableComponent.COMMAND,
      options.commandSeverity !== SeverityLevel.OFF
        ? options.commandSeverity
        : options.defaultSeverity
    );
    this.componentSeverities.set(
      LoggableComponent.TOPOLOGY,
      options.topologySeverity !== SeverityLevel.OFF
        ? options.topologySeverity
        : options.defaultSeverity
    );
    this.componentSeverities.set(
      LoggableComponent.SERVER_SELECTION,
      options.serverSelectionSeverity !== SeverityLevel.OFF
        ? options.serverSelectionSeverity
        : options.defaultSeverity
    );
    this.componentSeverities.set(
      LoggableComponent.CONNECTION,
      options.connectionSeverity !== SeverityLevel.OFF
        ? options.connectionSeverity
        : options.defaultSeverity
    );

    // fill max doc length
    if (options.maxDocumentLength < 0)
      throw new MongoInvalidArgumentError('MONGODB_LOG_MAX_DOCUMENT_LENGTH must be >= 0');
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
}
