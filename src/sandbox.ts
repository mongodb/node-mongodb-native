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

/** @public */
export interface LoggerOptions {
  [key: string]: SeverityLevel | string | number | undefined;
  MONGODB_LOG_COMMAND?: SeverityLevel;
  MONGODB_LOG_TOPOLOGY?: SeverityLevel;
  MONGODB_LOG_SERVER_SELECTION?: SeverityLevel;
  MONGODB_LOG_CONNECTION?: SeverityLevel;
  MONGODB_LOG_ALL?: SeverityLevel;
  MONGODB_LOG_MAX_DOCUMENT_LENGTH?: number;
  MONGODB_LOG_PATH?: string;
}

// function extractLoggerEnvOptions(): LoggerOptions {
//   const loggerOptions: LoggerOptions = {};

//   // set comp severities
//   const validSeverities = Object.values(SeverityLevel);
//   const loggingComponents = [
//     'MONGODB_LOG_COMMAND',
//     'MONGODB_LOG_TOPOLOGY',
//     'MONGODB_LOG_SERVER_SELECTION',
//     'MONGODB_LOG_CONNECTION',
//     'MONGODB_LOG_ALL'
//   ];

//   for (const component of loggingComponents) {
//     const severity = (process.env[component] ?? '').toLowerCase();
//     if (validSeverities.includes(severity as SeverityLevel))
//       loggerOptions[component] = severity as SeverityLevel;
//   }

//   return loggerOptions;
// }

const t = SeverityLevel.CRITICAL;

console.log(typeof t);
