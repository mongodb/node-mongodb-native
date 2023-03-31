import { EJSON } from 'bson';
import { Writable } from 'stream';

import {
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent
} from './cmap/command_monitoring_events';
import {
  ConnectionCheckedInEvent,
  ConnectionCheckedOutEvent,
  ConnectionCheckOutFailedEvent,
  ConnectionCheckOutStartedEvent,
  ConnectionClosedEvent,
  ConnectionCreatedEvent,
  ConnectionPoolClearedEvent,
  ConnectionPoolClosedEvent,
  ConnectionPoolCreatedEvent,
  ConnectionPoolMonitoringEvent,
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
class SeverityLevelMap extends Map<SeverityLevel | number, SeverityLevel | number> {
  constructor(entries: [SeverityLevel | number, SeverityLevel | number][]) {
    const newEntries: [number | SeverityLevel, SeverityLevel | number][] = [];
    for (const [level, value] of entries) {
      newEntries.push([value, level]);
    }

    newEntries.push(...entries);
    super(newEntries);
  }

  getNumericSeverityLevel(severity: SeverityLevel): number {
    return this.get(severity) as number;
  }

  getSeverityLevelName(level: number): SeverityLevel | undefined {
    return this.get(level) as SeverityLevel | undefined;
  }
}

/** @internal */
export const SEVERITY_LEVEL_MAP = new SeverityLevelMap([
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
  const s0Num = SEVERITY_LEVEL_MAP.getNumericSeverityLevel(s0);
  const s1Num = SEVERITY_LEVEL_MAP.getNumericSeverityLevel(s1);

  return s0Num < s1Num ? -1 : s0Num > s1Num ? 1 : 0;
}

function DEFAULT_LOG_TRANSFORM(logObject: Record<string, any>): Omit<Log, 's' | 't' | 'c'> {
  let log: Omit<Log, 's' | 't' | 'c'> = {};

  const getHostPort = (s: string): { host: string; port: number } => {
    const lastColon = s.lastIndexOf(':');
    const host = s.slice(0, lastColon);
    const port = Number.parseInt(s.slice(lastColon + 1));
    return { host, port };
  };

  const attachCommandFields = (
    l: any,
    ev: CommandStartedEvent | CommandSucceededEvent | CommandFailedEvent
  ) => {
    l.commandName = ev.commandName;
    l.requestId = ev.requestId;
    l.driverConnectionId = ev?.connectionId;
    const { host, port } = getHostPort(ev.address);
    l.serverHost = host;
    l.serverPort = port;
    l.serviceId = ev?.serviceId;

    return l;
  };

  const attachConnectionFields = (l: any, ev: ConnectionPoolMonitoringEvent) => {
    const { host, port } = getHostPort(ev.address);
    l.serverHost = host;
    l.serverPort = port;

    return l;
  };

  let ev;
  switch (logObject.name) {
    case 'CommandStarted':
      ev = logObject as CommandStartedEvent;
      log = attachCommandFields(log, ev);
      log.message = 'Command started';
      log.command = EJSON.stringify(ev.command);
      log.databaseName = ev.databaseName;
      break;
    case 'CommandSucceeded':
      ev = logObject as CommandSucceededEvent;
      log = attachCommandFields(log, ev);
      log.message = 'Command succeeded';
      log.durationMS = ev.duration;
      log.reply = EJSON.stringify(ev.reply);
      break;
    case 'CommandFailed':
      ev = logObject as CommandFailedEvent;
      log = attachCommandFields(log, ev);
      log.message = 'Command failed';
      log.durationMS = ev.duration;
      log.failure = ev.failure;
      break;
    case 'ConnectionPoolCreated':
      ev = logObject as ConnectionPoolCreatedEvent;
      log = attachConnectionFields(log, ev);
      log.message = 'Connection pool created';
      if (ev.options) {
        const { maxIdleTimeMS, minPoolSize, maxPoolSize, maxConnecting, waitQueueTimeoutMS } =
          ev.options;
        log = {
          ...log,
          maxIdleTimeMS,
          minPoolSize,
          maxPoolSize,
          maxConnecting,
          waitQueueTimeoutMS
        };
        log.waitQueueSize = ev.waitQueueSize;
      }
      break;
    case 'ConnectionPoolReady':
      ev = logObject as ConnectionPoolReadyEvent;
      log = attachConnectionFields(log, ev);
      log.message = 'Connection pool ready';
      break;
    case 'ConnectionPoolCleared':
      ev = logObject as ConnectionPoolClearedEvent;
      log = attachConnectionFields(log, ev);
      log.message = 'Connection pool cleared';
      log.serviceId = ev?.serviceId;
      break;
    case 'ConnectionPoolClosed':
      ev = logObject as ConnectionPoolClosedEvent;
      log = attachConnectionFields(log, ev);
      log.message = 'Connection pool closed';
      break;
    case 'ConnectionCreated':
      ev = logObject as ConnectionCreatedEvent;
      log = attachConnectionFields(log, ev);
      log.message = 'Connection created';
      log.driverConnectionId = ev.connectionId;
      break;
    case 'ConnectionReady':
      ev = logObject as ConnectionReadyEvent;
      log = attachConnectionFields(log, ev);
      log.message = 'Connection ready';
      log.driverConnectionId = ev.connectionId;
      break;
    case 'ConnectionClosed':
      ev = logObject as ConnectionClosedEvent;
      log = attachConnectionFields(log, ev);
      log.message = 'Connection closed';
      log.driverConnectionId = ev.connectionId;
      log.reason = ev.reason;
      if (ev.reason === 'error') {
        // TODO: Set log.error
        // log.error = ev
      }
      break;
    case 'ConnectionCheckOutStarted':
      ev = logObject as ConnectionCheckOutStartedEvent;
      log = attachConnectionFields(log, ev);
      log.message = 'Connection checkout started';
      break;
    case 'ConnectionCheckOutFailed':
      ev = logObject as ConnectionCheckOutFailedEvent;
      log = attachConnectionFields(log, ev);
      log.message = 'Connection checkout failed';
      log.reason = ev.reason;
      break;
    case 'ConnectionCheckedOut':
      ev = logObject as ConnectionCheckedOutEvent;
      log = attachConnectionFields(log, ev);
      log.message = 'Connection checked out';
      log.driverConnectionId = ev.connectionId;
      break;
    case 'ConnectionCheckedIn':
      ev = logObject as ConnectionCheckedInEvent;
      log = attachConnectionFields(log, ev);
      log.message = 'Connection checked in';
      log.driverConnectionId = ev.connectionId;
      break;
    default:
      log = { ...log, ...logObject };
  }
  return log;
}

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

  /** @experimental */
  emergency(component: MongoLoggableComponent, message: Record<string, any> | string): void {
    this.log(component, 'emergency', message);
  }
  /** @experimental */
  alert(component: MongoLoggableComponent, message: Record<string, any> | string): void {
    this.log(component, 'alert', message);
  }
  /** @experimental */
  critical(component: MongoLoggableComponent, message: Record<string, any> | string): void {
    this.log(component, 'critical', message);
  }
  /** @experimental */
  error(component: MongoLoggableComponent, message: Record<string, any> | string): void {
    this.log(component, 'error', message);
  }
  /** @experimental */
  notice(component: MongoLoggableComponent, message: Record<string, any> | string): void {
    this.log(component, 'notice', message);
  }
  /** @experimental */
  warn(component: MongoLoggableComponent, message: Record<string, any> | string): void {
    this.log(component, 'warn', message);
  }
  /** @experimental */
  info(component: MongoLoggableComponent, message: Record<string, any> | string): void {
    this.log(component, 'info', message);
  }
  /** @experimental */
  debug(component: MongoLoggableComponent, message: Record<string, any> | string): void {
    this.log(component, 'debug', message);
  }
  /** @experimental */
  trace(component: MongoLoggableComponent, message: Record<string, any> | string): void {
    this.log(component, 'trace', message);
  }

  private log(
    component: MongoLoggableComponent,
    severity: SeverityLevel,
    message: Record<string, any> | string
  ): void {
    if (compareSeverity(severity, this.componentSeverities[component]) <= 0) {
      let logMessage: Log = { t: new Date(), c: component, s: severity };
      if (typeof message === 'string') {
        logMessage.message = message;
      } else {
        if (message.toLog && typeof message.toLog === 'function') {
          logMessage = { ...logMessage, ...message.toLog() };
        } else {
          logMessage = { ...logMessage, ...DEFAULT_LOG_TRANSFORM(message) };
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
