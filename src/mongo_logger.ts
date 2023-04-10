import { EJSON } from 'bson';
import type { Writable } from 'stream';
import { inspect } from 'util';

import type {
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent
} from './cmap/command_monitoring_events';
import type {
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
import {
  APM_EVENTS,
  CMAP_EVENTS,
  COMMAND_FAILED,
  COMMAND_STARTED,
  COMMAND_SUCCEEDED,
  CONNECTION_CHECK_OUT_FAILED,
  CONNECTION_CHECK_OUT_STARTED,
  CONNECTION_CHECKED_IN,
  CONNECTION_CHECKED_OUT,
  CONNECTION_CLOSED,
  CONNECTION_CREATED,
  CONNECTION_POOL_CLEARED,
  CONNECTION_POOL_CLOSED,
  CONNECTION_POOL_CREATED,
  CONNECTION_POOL_READY,
  CONNECTION_READY
} from './constants';
import { HostAddress, parseUnsignedInteger } from './utils';

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
  mongodbLogPath?: 'stdout' | 'stderr' | MongoDBLogWritable;
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
  logDestination: Writable | MongoDBLogWritable;
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

type ClientLogPathOptions = {
  mongodbLogPath?: string | Writable | MongoDBLogWritable;
};

/** @internal */
export function createStdLogger(stream: {
  write: NodeJS.WriteStream['write'];
}): MongoDBLogWritable {
  return {
    write: (log: Log): unknown => {
      stream.write(inspect(log, { compact: true, breakLength: Infinity }), 'utf-8');
      return;
    }
  };
}

/**
 * resolves the MONGODB_LOG_PATH and mongodbLogPath options from the environment and the
 * mongo client options respectively.
 *
 * @returns the Writable stream to write logs to
 */
function resolveLogPath(
  { MONGODB_LOG_PATH }: MongoLoggerEnvOptions,
  { mongodbLogPath }: ClientLogPathOptions
): MongoDBLogWritable {
  if (mongodbLogPath === 'stderr') return createStdLogger(process.stderr);
  if (mongodbLogPath === 'stdout') return createStdLogger(process.stdout);

  if (typeof mongodbLogPath === 'object' && typeof mongodbLogPath?.write === 'function') {
    return mongodbLogPath;
  }

  if (MONGODB_LOG_PATH === 'stderr') return createStdLogger(process.stderr);
  if (MONGODB_LOG_PATH === 'stdout') return createStdLogger(process.stdout);

  return createStdLogger(process.stderr);
}

/** @internal */
export interface Log extends Record<string, any> {
  t: Date;
  c: MongoLoggableComponent;
  s: SeverityLevel;
  message?: string;
}

/** @internal */
export interface MongoDBLogWritable {
  write(log: Log): unknown;
}

function compareSeverity(s0: SeverityLevel, s1: SeverityLevel): 1 | 0 | -1 {
  const s0Num = SEVERITY_LEVEL_MAP.getNumericSeverityLevel(s0);
  const s1Num = SEVERITY_LEVEL_MAP.getNumericSeverityLevel(s1);

  return s0Num < s1Num ? -1 : s0Num > s1Num ? 1 : 0;
}

/** @internal */
export type LoggableEvent =
  | CommandStartedEvent
  | CommandSucceededEvent
  | CommandFailedEvent
  | ConnectionPoolCreatedEvent
  | ConnectionPoolReadyEvent
  | ConnectionPoolClosedEvent
  | ConnectionPoolClearedEvent
  | ConnectionCreatedEvent
  | ConnectionReadyEvent
  | ConnectionClosedEvent
  | ConnectionCheckedInEvent
  | ConnectionCheckedOutEvent
  | ConnectionCheckOutStartedEvent
  | ConnectionCheckOutFailedEvent;

/** @internal */
export interface LogConvertible extends Record<string, any> {
  toLog(): Record<string, any>;
}

/** @internal */
export type Loggable = LoggableEvent | LogConvertible;

function isLogConvertible(obj: Loggable): obj is LogConvertible {
  const objAsLogConvertible = obj as LogConvertible;
  // eslint-disable-next-line no-restricted-syntax
  return objAsLogConvertible.toLog !== undefined && typeof objAsLogConvertible.toLog === 'function';
}

function getHostPort(address: string): { host: string; port: number } {
  const hostAddress = new HostAddress(address);

  // NOTE: Should only default when the address is a socket address
  if (hostAddress.socketPath) {
    return { host: hostAddress.socketPath, port: 0 };
  }

  const host = hostAddress.host ?? '';
  const port = hostAddress.port ?? 0;
  return { host, port };
}

function attachCommandFields(
  l: any,
  ev: CommandStartedEvent | CommandSucceededEvent | CommandFailedEvent
) {
  l.commandName = ev.commandName;
  l.requestId = ev.requestId;
  l.driverConnectionId = ev?.connectionId;
  const { host, port } = getHostPort(ev.address);
  l.serverHost = host;
  l.serverPort = port;
  if (ev?.serviceId) {
    l.serviceId = ev.serviceId.toHexString();
  }

  return l;
}

function attachConnectionFields(l: any, ev: ConnectionPoolMonitoringEvent) {
  const { host, port } = getHostPort(ev.address);
  l.serverHost = host;
  l.serverPort = port;

  return l;
}

function DEFAULT_LOG_TRANSFORM(logObject: Loggable): Omit<Log, 's' | 't' | 'c'> {
  let log: Omit<Log, 's' | 't' | 'c'> = Object.create(null);

  if (APM_EVENTS.includes(logObject.name)) {
    log = attachCommandFields(log, logObject as any);
    switch (logObject.name) {
      case COMMAND_STARTED:
        log.message = 'Command started';
        log.command = EJSON.stringify(logObject.command);
        log.databaseName = logObject.databaseName;
        break;
      case COMMAND_SUCCEEDED:
        log.message = 'Command succeeded';
        log.durationMS = logObject.duration;
        log.reply = EJSON.stringify(logObject.reply);
        break;
      case COMMAND_FAILED:
        log.message = 'Command failed';
        log.durationMS = logObject.duration;
        log.failure = logObject.failure;
        break;
    }
  } else if (CMAP_EVENTS.includes(logObject.name)) {
    log = attachConnectionFields(log, logObject as ConnectionPoolMonitoringEvent);
    switch (logObject.name) {
      case CONNECTION_POOL_CREATED:
        log.message = 'Connection pool created';
        if (logObject.options) {
          const { maxIdleTimeMS, minPoolSize, maxPoolSize, maxConnecting, waitQueueTimeoutMS } =
            logObject.options;
          log = {
            ...log,
            maxIdleTimeMS,
            minPoolSize,
            maxPoolSize,
            maxConnecting,
            waitQueueTimeoutMS
          };
          log.waitQueueSize = logObject.waitQueueSize;
        }
        break;
      case CONNECTION_POOL_READY:
        log.message = 'Connection pool ready';
        break;
      case CONNECTION_POOL_CLEARED:
        log.message = 'Connection pool cleared';
        if (logObject.serviceId?._bsontype === 'ObjectId') {
          log.serviceId = logObject.serviceId.toHexString();
        }
        break;
      case CONNECTION_POOL_CLOSED:
        log.message = 'Connection pool closed';
        break;
      case CONNECTION_CREATED:
        log.message = 'Connection created';
        log.driverConnectionId = logObject.connectionId;
        break;
      case CONNECTION_READY:
        log.message = 'Connection ready';
        log.driverConnectionId = logObject.connectionId;
        break;
      case CONNECTION_CLOSED:
        log.message = 'Connection closed';
        log.driverConnectionId = logObject.connectionId;
        switch (logObject.reason) {
          case 'stale':
            log.reason = 'Connection became stale because the pool was cleared';
            break;
          case 'idle':
            log.reason =
              'Connection has been available but unused for longer than the configured max idle time';
            break;
          case 'error':
            log.reason = 'An error occurred while using the connection';
            if (logObject.error) {
              log.error = logObject.error;
            }
            break;
          case 'poolClosed':
            log.reason = 'Connection pool was closed';
            break;
          default:
          // Omit if we have some other reason as it would be invalid
        }
        break;
      case CONNECTION_CHECK_OUT_STARTED:
        log.message = 'Connection checkout started';
        break;
      case CONNECTION_CHECK_OUT_FAILED:
        log.message = 'Connection checkout failed';
        log.reason = logObject.reason;
        break;
      case CONNECTION_CHECKED_OUT:
        log.message = 'Connection checked out';
        log.driverConnectionId = logObject.connectionId;
        break;
      case CONNECTION_CHECKED_IN:
        log.message = 'Connection checked in';
        log.driverConnectionId = logObject.connectionId;
        break;
    }
  } else {
    for (const [key, value] of Object.entries(logObject)) {
      if (value != null) log[key] = value;
    }
  }
  return log;
}

/** @internal */
export class MongoLogger {
  componentSeverities: Record<MongoLoggableComponent, SeverityLevel>;
  maxDocumentLength: number;
  logDestination: MongoDBLogWritable | Writable;

  constructor(options: MongoLoggerOptions) {
    this.componentSeverities = options.componentSeverities;
    this.maxDocumentLength = options.maxDocumentLength;
    this.logDestination = options.logDestination;
  }

  /** @experimental */
  emergency = this.log.bind(this, 'emergency');

  private log(
    severity: SeverityLevel,
    component: MongoLoggableComponent,
    message: Loggable | string
  ): void {
    if (compareSeverity(severity, this.componentSeverities[component]) > 0) return;

    let logMessage: Log = { t: new Date(), c: component, s: severity };
    if (typeof message === 'string') {
      logMessage.message = message;
    } else if (typeof message === 'object') {
      if (isLogConvertible(message)) {
        logMessage = { ...logMessage, ...message.toLog() };
      } else {
        logMessage = { ...logMessage, ...DEFAULT_LOG_TRANSFORM(message) };
      }
    }
    this.logDestination.write(logMessage);
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
