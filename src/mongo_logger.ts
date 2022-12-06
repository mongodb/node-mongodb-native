import type { Writable } from 'stream';

import { getUint } from './utils';

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
  try {
    const maxDocumentLength = getUint('MONGODB_LOG_MAX_DOCUMENT_LENGTH', s);
    return maxDocumentLength;
  } catch {
    return 1000;
  }
}

/**
 * Parses a string for logDestination. Strings containing 'stderr' or 'stdout' are treated as
 * case-insensitive.
 *
 * @param logDestination - the destination to write logs to
 * @returns the original string if a file path was passed. Otherwise one of ['stderr', 'stdout'].
 */
function parseLogDestination(logDestination?: string): string {
  if (typeof logDestination === 'string' && logDestination !== '') {
    const lowerLogDestination = logDestination.toLowerCase();
    return lowerLogDestination === 'stdout' || lowerLogDestination === 'stderr'
      ? lowerLogDestination
      : logDestination;
  }

  return 'stderr';
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
  /** Destination for log messages */
  mongodbLogPath?: 'stdout' | 'stderr' | Writable;
}

/** @internal */
export interface MongoLoggerOptions {
  componentSeverities: {
    /** Severity level for command component */
    command: SeverityLevel;
    /** Severity level for topology component */
    topology: SeverityLevel;
    /** Severity level for server selection component */
    serverSelection: SeverityLevel;
    /** Severity level for connection component */
    connection: SeverityLevel;
    /** Default severity level to be used if any of the above are unset */
    default: SeverityLevel;
  };

  /** Max length of embedded EJSON docs. Setting to 0 disables truncation. Defaults to 1000. */
  maxDocumentLength: number;
  /** Destination for log messages. */
  logDestination: Writable;
}

/** @internal */
export class MongoLogger {
  componentSeverities: Record<MongoLoggableComponent, SeverityLevel>;
  maxDocumentLength: number;
  logDestination: Writable;

  constructor(options: MongoLoggerOptions) {
    this.componentSeverities = options.componentSeverities;
    this.maxDocumentLength = options.maxDocumentLength;
    this.logDestination = options.logDestination;
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
    // client options take precedence over env options
    const combinedOptions = {
      ...envOptions,
      ...clientOptions,
      mongodbLogPath:
        clientOptions.mongodbLogPath != null
          ? clientOptions.mongodbLogPath
          : envOptions.MONGODB_LOG_PATH != null
          ? envOptions.MONGODB_LOG_PATH
          : 'stderr'
    };
    const defaultSeverity =
      parseSeverityFromString(combinedOptions.MONGODB_LOG_ALL) ?? SeverityLevel.OFF;
    const logDestination: MongoLoggerOptions['logDestination'] =
      typeof combinedOptions.mongodbLogPath !== 'string'
        ? combinedOptions.mongodbLogPath
        : combinedOptions.mongodbLogPath === 'stderr'
        ? process.stderr
        : process.stdout;

    return {
      componentSeverities: {
        command: parseSeverityFromString(combinedOptions.MONGODB_LOG_COMMAND) ?? defaultSeverity,
        topology: parseSeverityFromString(combinedOptions.MONGODB_LOG_TOPOLOGY) ?? defaultSeverity,
        serverSelection:
          parseSeverityFromString(combinedOptions.MONGODB_LOG_SERVER_SELECTION) ?? defaultSeverity,
        connection:
          parseSeverityFromString(combinedOptions.MONGODB_LOG_CONNECTION) ?? defaultSeverity,
        default: defaultSeverity
      },
      maxDocumentLength: parseMaxDocumentLength(combinedOptions.MONGODB_LOG_MAX_DOCUMENT_LENGTH),
      logDestination
    };
  }
}
