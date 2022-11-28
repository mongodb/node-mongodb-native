import { expect } from 'chai';

import { MongoLogger, SeverityLevel } from '../../src/mongo_logger';

describe('class MongoLogger', function () {
  describe('static #resolveOptions', function () {
    it('treats severity values as case-insensitive', function () {
      const loggerOptions = MongoLogger.resolveOptions(
        {
          MONGODB_LOG_COMMAND: 'EMERGENCY',
          MONGODB_LOG_TOPOLOGY: 'critical',
          MONGODB_LOG_SERVER_SELECTION: 'aLeRt'
        },
        {}
      );
      expect(loggerOptions.command).to.equal(SeverityLevel.EMERGENCY);
      expect(loggerOptions.topology).to.equal(SeverityLevel.CRITICAL);
      expect(loggerOptions.serverSelection).to.equal(SeverityLevel.ALERT);
    });

    it('treats invalid severity values as off', function () {
      const loggerOptions = MongoLogger.resolveOptions(
        {
          MONGODB_LOG_COMMAND: 'invalid'
        },
        {}
      );
      expect(loggerOptions.command).to.equal(SeverityLevel.OFF);
    });

    it('can set severity levels per component', function () {
      const loggerOptions = MongoLogger.resolveOptions(
        {
          MONGODB_LOG_COMMAND: SeverityLevel.EMERGENCY,
          MONGODB_LOG_TOPOLOGY: SeverityLevel.CRITICAL,
          MONGODB_LOG_SERVER_SELECTION: SeverityLevel.ALERT,
          MONGODB_LOG_CONNECTION: SeverityLevel.DEBUG,
          MONGODB_LOG_ALL: SeverityLevel.WARNING
        },
        {}
      );
      expect(loggerOptions.command).to.equal(SeverityLevel.EMERGENCY);
      expect(loggerOptions.topology).to.equal(SeverityLevel.CRITICAL);
      expect(loggerOptions.serverSelection).to.equal(SeverityLevel.ALERT);
      expect(loggerOptions.connection).to.equal(SeverityLevel.DEBUG);
      expect(loggerOptions.defaultSeverity).to.equal(SeverityLevel.WARNING);
    });

    it('only uses the default severity for component severities that are not set or invalid', function () {
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

    it('gives precedence to environment variables over client options if both are set', function () {
      const loggerOptions = MongoLogger.resolveOptions(
        { MONGODB_LOG_PATH: 'env' },
        { mongodbLogPath: 'client' }
      );
      expect(loggerOptions.logDestination).to.equal('env');
    });

    context('maxDocumentLength', function () {
      it('defaults to 1000 if MONGODB_LOG_MAX_DOCUMENT_LENGTH is undefined', function () {
        const loggerOptions = MongoLogger.resolveOptions(
          {
            MONGODB_LOG_MAX_DOCUMENT_LENGTH: undefined
          },
          {}
        );
        expect(loggerOptions.maxDocumentLength).to.equal(1000);
      });

      it('defaults to 1000 if MONGODB_LOG_MAX_DOCUMENT_LENGTH is an empty string', function () {
        const loggerOptions = MongoLogger.resolveOptions(
          {
            MONGODB_LOG_MAX_DOCUMENT_LENGTH: ''
          },
          {}
        );
        expect(loggerOptions.maxDocumentLength).to.equal(1000);
      });

      it('defaults to 1000 if MONGODB_LOG_MAX_DOCUMENT_LENGTH cannot be parsed as a uint', function () {
        const loggerOptions = MongoLogger.resolveOptions(
          {
            MONGODB_LOG_MAX_DOCUMENT_LENGTH: 'invalid'
          },
          {}
        );
        expect(loggerOptions.maxDocumentLength).to.equal(1000);
      });

      it('uses the passed value if MONGODB_LOG_MAX_DOCUMENT_LENGTH can be parsed a uint', function () {
        const loggerOptions = MongoLogger.resolveOptions(
          {
            MONGODB_LOG_MAX_DOCUMENT_LENGTH: '500'
          },
          {}
        );
        expect(loggerOptions.maxDocumentLength).to.equal(500);
      });
    });

    context('logDestination', function () {
      it('defaults to stderr if MONGODB_LOG_PATH and mongodbLogPath are undefined', function () {
        const loggerOptions = MongoLogger.resolveOptions(
          { MONGODB_LOG_PATH: undefined },
          { mongodbLogPath: undefined }
        );
        expect(loggerOptions.logDestination).to.equal('stderr');
      });

      it('defaults to stderr if MONGODB_LOG_PATH is an empty string', function () {
        const loggerOptions = MongoLogger.resolveOptions({ MONGODB_LOG_PATH: '' }, {});
        expect(loggerOptions.logDestination).to.equal('stderr');
      });

      it('uses the passed value of MONGODB_LOG_PATH if it is not undefined and not an empty string', function () {
        const loggerOptions = MongoLogger.resolveOptions({ MONGODB_LOG_PATH: 'file.txt' }, {});
        expect(loggerOptions.logDestination).to.equal('file.txt');
      });

      it('uses the passed value of mongodbLogPath if MONGODB_LOG_PATH is undefined', function () {
        const loggerOptions = MongoLogger.resolveOptions(
          { MONGODB_LOG_PATH: undefined },
          { mongodbLogPath: 'file.txt' }
        );
        expect(loggerOptions.logDestination).to.equal('file.txt');
      });
    });
  });

  it('treats loggerOptions.logDestination value of stderr as case-insensitve', function () {
    const loggerOptions = MongoLogger.resolveOptions({ MONGODB_LOG_PATH: 'STDERR' }, {});
    const logger = new MongoLogger(loggerOptions);
    expect(logger.logDestination).to.equal(process['stderr']);
  });

  it('treats loggerOptions.logDestination value of stdout as case-insensitve', function () {
    const loggerOptions = MongoLogger.resolveOptions({ MONGODB_LOG_PATH: 'STDOUT' }, {});
    const logger = new MongoLogger(loggerOptions);
    expect(logger.logDestination).to.equal(process['stdout']);
  });
});
