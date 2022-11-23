import { expect } from 'chai';

import {
  MongoLoggableComponent,
  MongoLogger,
  MongoLoggerOptions,
  SeverityLevel
} from '../../src/mongo_logger';

describe('Logger', function () {
  describe('options parsing', function () {
    let loggerOptions: MongoLoggerOptions;

    before(function () {
      // MONGODB_LOG_COMMAND is not set so it defaults to undefined
      process.env.MONGODB_LOG_TOPOLOGY = '';
      process.env.MONGODB_LOG_SERVER_SELECTION = 'invalid';
      process.env.MONGODB_LOG_CONNECTION = 'CRITICAL';
      process.env.MONGODB_LOG_ALL = 'eRrOr';
      process.env.MONGODB_LOG_MAX_DOCUMENT_LENGTH = '100';
      process.env.MONGODB_LOG_PATH = 'stderr';

      loggerOptions = MongoLogger.resolveOptions();
    });

    it('treats severity values as case-insensitive', function () {
      expect(loggerOptions.connection).to.equal(SeverityLevel.CRITICAL);
      expect(loggerOptions.defaultSeverity).to.equal(SeverityLevel.ERROR);
    });

    it('will only use MONGODB_LOG_ALL for component severities that are not set or invalid', function () {
      expect(loggerOptions.command).to.equal(loggerOptions.defaultSeverity); // empty str
      expect(loggerOptions.topology).to.equal(loggerOptions.defaultSeverity); // undefined
      expect(loggerOptions.serverSelection).to.equal(loggerOptions.defaultSeverity); // invalid
    });

    it('can set severity levels per component', function () {
      const { componentSeverities } = new MongoLogger(loggerOptions);

      expect(componentSeverities).property(MongoLoggableComponent.COMMAND, SeverityLevel.ERROR);
      expect(componentSeverities).property(MongoLoggableComponent.TOPOLOGY, SeverityLevel.ERROR);
      expect(componentSeverities).property(
        MongoLoggableComponent.SERVER_SELECTION,
        SeverityLevel.ERROR
      );
      expect(componentSeverities).property(
        MongoLoggableComponent.CONNECTION,
        SeverityLevel.CRITICAL
      );
    });
  });
});
