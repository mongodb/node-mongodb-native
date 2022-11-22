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
const LoggableComponent = Object.freeze({
  COMMAND: 'command',
  TOPOLOGY: 'topology',
  SERVER_SELECTION: 'serverSelection',
  CONNECTION: 'connection'
} as const);

/** @internal */
type LoggableComponent = typeof LoggableComponent[keyof typeof LoggableComponent];

/** @public */
export interface LoggerOptions {
  MONGODB_LOG_COMMAND: SeverityLevel;
  MONGODB_LOG_TOPOLOGY: SeverityLevel;
  MONGODB_LOG_SERVER_SELECTION: SeverityLevel;
  MONGODB_LOG_CONNECTION: SeverityLevel;
  MONGODB_LOG_ALL: SeverityLevel;
  MONGODB_LOG_MAX_DOCUMENT_LENGTH: number;
  MONGODB_LOG_PATH: string | Writable;
}

/** @public */
export class Logger {
  /** @internal */
  componentSeverities: Map<LoggableComponent, SeverityLevel | undefined> = new Map();
  maxDocumentLength: number;
  logDestination: Writable;

  constructor(options: LoggerOptions) {
    // validate log path
    if (typeof options.MONGODB_LOG_PATH === 'string') {
      this.logDestination =
        options.MONGODB_LOG_PATH === 'stderr' || options.MONGODB_LOG_PATH === 'stdout'
          ? process[options.MONGODB_LOG_PATH]
          : fs.createWriteStream(options.MONGODB_LOG_PATH, { flags: 'a+' });
    } else {
      this.logDestination = options.MONGODB_LOG_PATH;
    }

    // fill component severities
    this.componentSeverities.set(
      LoggableComponent.COMMAND,
      options.MONGODB_LOG_COMMAND ?? options.MONGODB_LOG_ALL
    );
    this.componentSeverities.set(
      LoggableComponent.TOPOLOGY,
      options.MONGODB_LOG_TOPOLOGY ?? options.MONGODB_LOG_ALL
    );
    this.componentSeverities.set(
      LoggableComponent.SERVER_SELECTION,
      options.MONGODB_LOG_SERVER_SELECTION ?? options.MONGODB_LOG_ALL
    );
    this.componentSeverities.set(
      LoggableComponent.CONNECTION,
      options.MONGODB_LOG_CONNECTION ?? options.MONGODB_LOG_ALL
    );

    // fill max doc length
    if (options.MONGODB_LOG_MAX_DOCUMENT_LENGTH < 0)
      throw new MongoInvalidArgumentError('MONGODB_LOG_MAX_DOCUMENT_LENGTH must be >= 0');
    this.maxDocumentLength = options.MONGODB_LOG_MAX_DOCUMENT_LENGTH;
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

/**
  MONGODB_LOG_COMMAND
  MONGODB_LOG_TOPOLOGY
  MONGODB_LOG_SERVER_SELECTION
  MONGODB_LOG_CONNECTION
  MONGODB_LOG_ALL
  MONGODB_LOG_MAX_DOCUMENT_LENGTH
  MONGODB_LOG_PATH
 */
