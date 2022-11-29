import * as fs from 'fs';
import type { Writable } from 'stream';

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

/**
 * Parses a string as one of SeverityLevel
 *
 * @param name - the name of the variable to be parsed
 * @param s - the value to be parsed
 * @returns one of SeverityLevel if value can be parsed as such, otherwise null
 */
function parseSeverityFromString(s?: string): SeverityLevel | null {
  const validSeverities: string[] = Object.values(SeverityLevel);
  const lowerSeverity = s?.toLowerCase();

  if (lowerSeverity != null && validSeverities.includes(lowerSeverity)) {
    return lowerSeverity as SeverityLevel;
  }

  return null;
}

/**
 * Parses a string to be a number greater than or equal to 0 for maxDocumentLength.
 *
 * @param s - the value to be parsed
 * @returns the int value parsed or 1000 if the value could not be parsed
 */
function parseMaxDocumentLength(s?: string): number {
  if (typeof s === 'string' && s !== '') {
    const parsedValue = Number.parseInt(s, 10);
    return !Number.isNaN(parsedValue) && parsedValue >= 0 ? parsedValue : 1000;
  }
  return 1000;
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
export interface MongoLoggerEnvOptions {
  /** Severity level for command component */
  MONGODB_LOG_COMMAND?: string;
  /** Severity level for topology component */
  MONGODB_LOG_TOPOLOGY?: string;
  /** Severity level for server selection component */
  MONGODB_LOG_SERVER_SELECTION?: string;
  /** Severity level for CMAP */
  MONGODB_LOG_CONNECTION?: string;
  /** Default severity level to be if any of the above are unset */
  MONGODB_LOG_ALL?: string;
  /** Max length of embedded EJSON docs. Setting to 0 disables truncation. Defaults to 1000. */
  MONGODB_LOG_MAX_DOCUMENT_LENGTH?: string;
  /** Destination for log messages. Must be 'stderr', 'stdout', or a file path. Defaults to 'stderr'. */
  MONGODB_LOG_PATH?: string;
}

/** @internal */
export interface MongoLoggerMongoClientOptions {
  /** Destination for log messages. Must be 'stderr' or 'stdout'. Defaults to 'stderr'. */
  mongodbLogPath?: string;
}

/** @internal */
export interface MongoLoggerOptions {
  /** Severity level for command component */
  command: SeverityLevel;
  /** Severity level for topology component */
  topology: SeverityLevel;
  /** Severity level for server selection component */
  serverSelection: SeverityLevel;
  /** Severity level for CMAP */
  connection: SeverityLevel;
  /** Default severity level to be if any of the above are unset */
  defaultSeverity: SeverityLevel;
  /** Max length of embedded EJSON docs. Setting to 0 disables truncation. Defaults to 1000. */
  maxDocumentLength: number;
  /** Destination for log messages. Must be 'stderr' or 'stdout'. Defaults to 'stderr'. */
  logDestination: string;
}

/** @internal */
export class MongoLogger {
  componentSeverities: Record<MongoLoggableComponent, SeverityLevel>;
  maxDocumentLength: number;
  logDestination: Writable;

  constructor(options: MongoLoggerOptions) {
    // TODO(NODE-4849): add filepath and Writable support
    this.logDestination =
      options.logDestination.toLowerCase() === 'stdout' ? process['stdout'] : process['stderr'];
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
   * Merges options set through environment variables and the MongoClient, preferring environment
   * variables when both are set, and substituting defaults for values not set. Options set in
   * constructor take precedence over both environment variables and MongoClient options.
   *
   * @remarks
   * When parsing component severity levels, invalid values are treated as unset and replaced with
   * the default severity.
   *
   * @param envOptions - options set for the logger from the environment
   * @param clientOptions - options set for the logger in the MongoClient options
   * @returns a MongoLoggerOptions object to be used when instantiating a new MongoLogger
   */
  static resolveOptions(
    envOptions: MongoLoggerEnvOptions,
    clientOptions: MongoLoggerMongoClientOptions
  ): MongoLoggerOptions {
    const defaultSeverity =
      parseSeverityFromString(envOptions.MONGODB_LOG_ALL) ?? SeverityLevel.OFF;

    return {
      command: parseSeverityFromString(envOptions.MONGODB_LOG_COMMAND) ?? defaultSeverity,
      topology: parseSeverityFromString(envOptions.MONGODB_LOG_TOPOLOGY) ?? defaultSeverity,
      serverSelection:
        parseSeverityFromString(envOptions.MONGODB_LOG_SERVER_SELECTION) ?? defaultSeverity,
      connection: parseSeverityFromString(envOptions.MONGODB_LOG_CONNECTION) ?? defaultSeverity,
      defaultSeverity,
      maxDocumentLength: parseMaxDocumentLength(envOptions.MONGODB_LOG_MAX_DOCUMENT_LENGTH),
      logDestination:
        typeof envOptions.MONGODB_LOG_PATH === 'string' && envOptions.MONGODB_LOG_PATH !== ''
          ? envOptions.MONGODB_LOG_PATH
          : clientOptions?.mongodbLogPath ?? 'stderr'
    };
  }
}
