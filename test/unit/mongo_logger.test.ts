import { expect } from 'chai';

import { MongoLogger, SeverityLevel } from '../../src/mongo_logger';

describe('class MongoLogger', function () {
  describe('options parsing', function () {
    it('treats severity values as case-insensitive', function () {
      const loggerOptions = MongoLogger.resolveOptions({ MONGODB_LOG_COMMAND: 'EMERGENCY' }, {});
      expect(loggerOptions.connection).to.equal(SeverityLevel.EMERGENCY);
    });

    it('can set severity levels per component', function () {
      const loggerOptions = MongoLogger.resolveOptions(
        {
          MONGODB_LOG_COMMAND: SeverityLevel.EMERGENCY,
          MONGODB_LOG_TOPOLOGY: SeverityLevel.CRITICAL,
          MONGODB_LOG_SERVER_SELECTION: SeverityLevel.ALERT,
          MONGODB_LOG_CONNECTION: SeverityLevel.DEBUG
        },
        {}
      );
      expect(loggerOptions.command).to.equal(SeverityLevel.EMERGENCY);
      expect(loggerOptions.topology).to.equal(SeverityLevel.CRITICAL);
      expect(loggerOptions.serverSelection).to.equal(SeverityLevel.ALERT);
      expect(loggerOptions.connection).to.equal(SeverityLevel.DEBUG);
    });

    it('will only use default severity for component severities that are not set or invalid', function () {
      const loggerOptions = MongoLogger.resolveOptions(
        {
          MONGODB_LOG_COMMAND: '',
          MONGODB_LOG_TOPOLOGY: undefined,
          MONGODB_LOG_SERVER_SELECTION: 'invalid',
          MONGODB_LOG_CONNECTION: SeverityLevel.EMERGENCY,
          MONGODB_LOG_ALL: SeverityLevel.CRITICAL
        },
        {}
      );
      expect(loggerOptions.command).to.equal(loggerOptions.defaultSeverity);
      expect(loggerOptions.topology).to.equal(loggerOptions.defaultSeverity);
      expect(loggerOptions.serverSelection).to.equal(loggerOptions.defaultSeverity);
      expect(loggerOptions.connection).to.equal(SeverityLevel.EMERGENCY);
    });
  });
});
