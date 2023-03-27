import { Document, EJSON } from 'bson';
import { Writable } from 'stream';

import {
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent
} from './cmap/command_monitoring_events';
import {
  ConnectionClosedEvent,
  ConnectionCreatedEvent,
  ConnectionPoolClearedEvent,
  ConnectionPoolClosedEvent,
  ConnectionPoolCreatedEvent,
  ConnectionPoolReadyEvent,
  ConnectionReadyEvent
} from './cmap/connection_pool_events';
import { parseUnsignedInteger } from './utils';

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
export type SeverityLevel = (typeof SeverityLevel)[keyof typeof SeverityLevel];

/** @internal */
export const SeverityLevelMap: Map<string | number, string | number> = new Map([
  [SeverityLevel.OFF, -Infinity],
  [SeverityLevel.EMERGENCY, 0],
  [SeverityLevel.ALERT, 1],
  [SeverityLevel.CRITICAL, 2],
  [SeverityLevel.ERROR, 3],
  [SeverityLevel.WARNING, 4],
  [SeverityLevel.NOTICE, 5],
  [SeverityLevel.INFORMATIONAL, 6],
  [SeverityLevel.DEBUG, 7],
  [SeverityLevel.TRACE, 8]
]);

for (const [level, value] of SeverityLevelMap) {
  SeverityLevelMap.set(value, level);
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
  (typeof MongoLoggableComponent)[keyof typeof MongoLoggableComponent];

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
  /** Destination for log messages. Must be 'stderr', 'stdout'. Defaults to 'stderr'. */
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
  logDestination: MongoDBLogWritable;
}

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
 * resolves the MONGODB_LOG_PATH and mongodbLogPath options from the environment and the
 * mongo client options respectively.
 *
 * @returns the Writable stream to write logs to
 */
function resolveLogPath(
  { MONGODB_LOG_PATH }: MongoLoggerEnvOptions,
  {
    mongodbLogPath
  }: {
    mongodbLogPath?: unknown;
  }
): Writable {
  const isValidLogDestinationString = (destination: string) =>
    ['stdout', 'stderr'].includes(destination.toLowerCase());
  if (typeof mongodbLogPath === 'string' && isValidLogDestinationString(mongodbLogPath)) {
    return mongodbLogPath.toLowerCase() === 'stderr' ? process.stderr : process.stdout;
  }

  // TODO(NODE-4813): check for minimal interface instead of instanceof Writable
  if (typeof mongodbLogPath === 'object' && mongodbLogPath instanceof Writable) {
    return mongodbLogPath;
  }

  if (typeof MONGODB_LOG_PATH === 'string' && isValidLogDestinationString(MONGODB_LOG_PATH)) {
    return MONGODB_LOG_PATH.toLowerCase() === 'stderr' ? process.stderr : process.stdout;
  }

  return process.stderr;
}

export interface Log extends Record<string, any> {
  s: SeverityLevel;
  t: Date;
  c: MongoLoggableComponent;
  message?: string;
}

export interface MongoDBLogWritable {
  write(log: Log): unknown;
}

function compareSeverity(s0: SeverityLevel, s1: SeverityLevel): 1 | 0 | -1 {
  const s0Num = SeverityLevelMap.get(s0) as number;
  const s1Num = SeverityLevelMap.get(s1) as number;

  return s0Num < s1Num ? -1 : s0Num > s1Num ? 1 : 0;
}

type LogTransform = (message: Record<string, any>) => Record<string, any>;

const DEFAULT_LOG_TRANSFORM = (message: Record<string, any>): Record<string, any> => {
  const commandCommonFields = (
    message: CommandStartedEvent | CommandSucceededEvent | CommandFailedEvent
  ) => {
    return {
      commandName: message.commandName,
      requestId: message.requestId,
      driverConnectionId: message.connectionId,
      serverHost: message.address,
      serverPort: message.address,
      serviceId: message.serviceId
    };
  };
  const maybeTruncate = (doc: Document, len: number): string => {
    const rv = EJSON.stringify(doc);
    return rv.length > len ? rv.slice(0, len) + '...' : rv;
  };

  if (message instanceof CommandStartedEvent) {
    return {
      ...commandCommonFields(message),
      message: 'Command started',
      command: maybeTruncate(message.command, 1000),
      databaseName: message.databaseName
    };
  } else if (message instanceof CommandSucceededEvent) {
    return {
      ...commandCommonFields(message),
      message: 'Command succeeded',
      durationMS: message.duration,
      reply: maybeTruncate(message.reply as Document, 1000)
    };
  } else if (message instanceof CommandFailedEvent) {
    return {
      ...commandCommonFields(message),
      message: 'Command failed',
      durationMS: message.duration,
      failure: message.failure
    };
  } else if (message instanceof ConnectionReadyEvent) {
  } else if (message instanceof ConnectionClosedEvent) {
  } else if (message instanceof ConnectionCreatedEvent) {
  } else if (message instanceof ConnectionPoolReadyEvent) {
  } else if (message instanceof ConnectionPoolClosedEvent) {
  } else if (message instanceof ConnectionPoolClearedEvent) {
  } else if (message instanceof ConnectionPoolCreatedEvent) {
  } else {
    return message;
  }

  return {};
};

/** @internal */
export class MongoLogger {
  componentSeverities: Record<MongoLoggableComponent, SeverityLevel>;
  maxDocumentLength: number;
  logDestination: MongoDBLogWritable;

  constructor(options: MongoLoggerOptions) {
    this.componentSeverities = options.componentSeverities;
    this.maxDocumentLength = options.maxDocumentLength;
    this.logDestination = options.logDestination;
  }

  emergency(
    component: MongoLoggableComponent,
    message: Record<string, any> | string,
    transform?: LogTransform
  ): void {
    this.log(component, 'emergency', message, transform);
  }
  alert(
    component: MongoLoggableComponent,
    message: Record<string, any> | string,
    transform?: LogTransform
  ): void {
    this.log(component, 'alert', message, transform);
  }
  critical(
    component: MongoLoggableComponent,
    message: Record<string, any> | string,
    transform: LogTransform = DEFAULT_LOG_TRANSFORM
  ): void {
    this.log(component, 'critical', message, transform);
  }
  error(
    component: MongoLoggableComponent,
    message: Record<string, any> | string,
    transform?: LogTransform
  ): void {
    this.log(component, 'error', message, transform);
  }
  warn(
    component: MongoLoggableComponent,
    message: Record<string, any> | string,
    transform?: LogTransform
  ): void {
    this.log(component, 'warn', message, transform);
  }
  info(
    component: MongoLoggableComponent,
    message: Record<string, any> | string,
    transform?: LogTransform
  ): void {
    this.log(component, 'info', message, transform);
  }
  debug(
    component: MongoLoggableComponent,
    message: Record<string, any> | string,
    transform?: LogTransform
  ): void {
    this.log(component, 'debug', message, transform);
  }
  trace(
    component: MongoLoggableComponent,
    message: Record<string, any> | string,
    transform?: LogTransform
  ): void {
    this.log(component, 'trace', message, transform);
  }

  private log(
    component: MongoLoggableComponent,
    severity: SeverityLevel,
    message: Record<string, any> | string,
    transform?: LogTransform
  ): void {
    if (compareSeverity(severity, this.componentSeverities[component]) <= 0) {
      let logMessage: Log = { t: new Date(), c: component, s: severity };
      if (typeof message === 'string') {
        logMessage.message = message;
      } else {
        if (transform) {
          logMessage = { ...logMessage, ...transform(message) };
        } else {
          logMessage = { ...logMessage, ...message };
        }
      }
      this.logDestination.write(logMessage);
    }
  }

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
      mongodbLogPath: resolveLogPath(envOptions, clientOptions)
    };
    const defaultSeverity =
      parseSeverityFromString(combinedOptions.MONGODB_LOG_ALL) ?? SeverityLevel.OFF;

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
      maxDocumentLength:
        parseUnsignedInteger(combinedOptions.MONGODB_LOG_MAX_DOCUMENT_LENGTH) ?? 1000,
      logDestination: combinedOptions.mongodbLogPath
    };
  }
}
