import { expect } from 'chai';

import { MongoLogger, SeverityLevel } from '../../src/mongo_logger';

describe('class MongoLogger', function () {
  describe('#constructor', function () {
    context('when an invalid value is passed', function () {
      it('sets the log destination to stderr if an invalid value is passed', function () {
        const loggerOptions = MongoLogger.resolveOptions({ MONGODB_LOG_PATH: 'invalid' }, {});
        const logger = new MongoLogger(loggerOptions);
        expect(logger.logDestination).to.equal(process.stderr);
      });
    });
  });

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
      expect(loggerOptions).to.have.nested.property(
        'severitySettings.command',
        SeverityLevel.EMERGENCY
      );
      expect(loggerOptions).to.have.nested.property(
        'severitySettings.topology',
        SeverityLevel.CRITICAL
      );
      expect(loggerOptions).to.have.nested.property(
        'severitySettings.serverSelection',
        SeverityLevel.ALERT
      );
    });

    it('treats invalid severity values as off', function () {
      const loggerOptions = MongoLogger.resolveOptions(
        {
          MONGODB_LOG_COMMAND: 'invalid'
        },
        {}
      );
      expect(loggerOptions).to.have.nested.property('severitySettings.command', SeverityLevel.OFF);
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
      expect(loggerOptions).to.have.nested.property(
        'severitySettings.command',
        SeverityLevel.EMERGENCY
      );
      expect(loggerOptions).to.have.nested.property(
        'severitySettings.topology',
        SeverityLevel.CRITICAL
      );
      expect(loggerOptions).to.have.nested.property(
        'severitySettings.serverSelection',
        SeverityLevel.ALERT
      );
      expect(loggerOptions).to.have.nested.property(
        'severitySettings.connection',
        SeverityLevel.DEBUG
      );
      expect(loggerOptions).to.have.nested.property(
        'severitySettings.default',
        SeverityLevel.WARNING
      );
    });

    context('when component severities are not set or invalid', function () {
      it('only uses the default severity for those components', function () {
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
        expect(loggerOptions).to.have.nested.property(
          'severitySettings.command',
          loggerOptions.severitySettings.default
        );
        expect(loggerOptions).to.have.nested.property(
          'severitySettings.topology',
          loggerOptions.severitySettings.default
        );
        expect(loggerOptions).to.have.nested.property(
          'severitySettings.serverSelection',
          loggerOptions.severitySettings.default
        );
        expect(loggerOptions).to.have.nested.property(
          'severitySettings.connection',
          loggerOptions.severitySettings.default
        );
      });
    });

    context('when environment variables and client options are both set', function () {
      it('gives precedence to environment variables', function () {
        const loggerOptions = MongoLogger.resolveOptions(
          { MONGODB_LOG_PATH: 'env' },
          { mongodbLogPath: 'client' }
        );
        expect(loggerOptions.logDestination).to.equal('env');
      });
    });

    context('maxDocumentLength', function () {
      context('when MONGODB_LOG_MAX_DOCUMENT_LENGTH is undefined', function () {
        it('defaults to 1000', function () {
          const loggerOptions = MongoLogger.resolveOptions(
            {
              MONGODB_LOG_MAX_DOCUMENT_LENGTH: undefined
            },
            {}
          );
          expect(loggerOptions.maxDocumentLength).to.equal(1000);
        });
      });

      context('when MONGODB_LOG_MAX_DOCUMENT_LENGTH is an empty string', function () {
        it('defaults to 1000', function () {
          const loggerOptions = MongoLogger.resolveOptions(
            {
              MONGODB_LOG_MAX_DOCUMENT_LENGTH: ''
            },
            {}
          );
          expect(loggerOptions.maxDocumentLength).to.equal(1000);
        });
      });

      context('when MONGODB_LOG_MAX_DOCUMENT_LENGTH cannot be parsed as a uint', function () {
        it('defaults to 1000', function () {
          const loggerOptions = MongoLogger.resolveOptions(
            {
              MONGODB_LOG_MAX_DOCUMENT_LENGTH: 'invalid'
            },
            {}
          );
          expect(loggerOptions.maxDocumentLength).to.equal(1000);
        });
      });

      context('when MONGODB_LOG_MAX_DOCUMENT_LENGTH can be parsed as a uint', function () {
        it('uses the passed value', function () {
          const loggerOptions = MongoLogger.resolveOptions(
            {
              MONGODB_LOG_MAX_DOCUMENT_LENGTH: '500'
            },
            {}
          );
          expect(loggerOptions.maxDocumentLength).to.equal(500);
        });
      });
    });

    context('logDestination', function () {
      context('when mongodbLogPath is undefined', function () {
        context('when MONGODB_LOG_PATH is undefined', function () {
          it('defaults to stderr', function () {
            const loggerOptions = MongoLogger.resolveOptions(
              { MONGODB_LOG_PATH: undefined },
              { mongodbLogPath: undefined }
            );
            expect(loggerOptions.logDestination).to.equal('stderr');
          });
        });

        context('when MONGODB_LOG_PATH is an empty string', function () {
          it('defaults to stderr', function () {
            const loggerOptions = MongoLogger.resolveOptions(
              { MONGODB_LOG_PATH: '' },
              { mongodbLogPath: undefined }
            );
            expect(loggerOptions.logDestination).to.equal('stderr');
          });
        });

        context('when MONGODB_LOG_PATH is stdout', function () {
          it('treats the value as case-insensitive', function () {
            const loggerOptions = MongoLogger.resolveOptions(
              { MONGODB_LOG_PATH: 'STDOUT' },
              { mongodbLogPath: undefined }
            );
            expect(loggerOptions).to.have.property('logDestination', 'stdout');
          });
        });

        context('when MONGODB_LOG_PATH is stderr', function () {
          it('treats the value as case-insensitive', function () {
            const loggerOptions = MongoLogger.resolveOptions(
              { MONGODB_LOG_PATH: 'STDERR' },
              { mongodbLogPath: undefined }
            );
            expect(loggerOptions).to.have.property('logDestination', 'stderr');
          });
        });

        context('when MONGODB_LOG_PATH is a non-empty string', function () {
          it('uses the passed value', function () {
            const loggerOptions = MongoLogger.resolveOptions(
              { MONGODB_LOG_PATH: '/path/to/file.txt' },
              { mongodbLogPath: undefined }
            );
            expect(loggerOptions.logDestination).to.equal('/path/to/file.txt');
          });
        });
      });

      context('when MONGODB_LOG_PATH is undefined', function () {
        context('when mongodbLogPath is an empty string', function () {
          it('defaults to stderr', function () {
            const loggerOptions = MongoLogger.resolveOptions(
              { MONGODB_LOG_PATH: undefined },
              { mongodbLogPath: '' }
            );
            expect(loggerOptions.logDestination).to.equal('stderr');
          });
        });

        context('when mongodbLogPath is stdout', function () {
          it('treats the value as case-insensitive', function () {
            const loggerOptions = MongoLogger.resolveOptions(
              { MONGODB_LOG_PATH: undefined },
              { mongodbLogPath: 'STDOUT' }
            );
            expect(loggerOptions).to.have.property('logDestination', 'stdout');
          });
        });

        context('when mongodbLogPath is stderr', function () {
          it('treats the value as case-insensitive', function () {
            const loggerOptions = MongoLogger.resolveOptions(
              { MONGODB_LOG_PATH: undefined },
              { mongodbLogPath: 'STDERR' }
            );
            expect(loggerOptions).to.have.property('logDestination', 'stderr');
          });
        });

        context('when mongodbLogPath is a non-empty string', function () {
          it('uses the passed value ', function () {
            const loggerOptions = MongoLogger.resolveOptions(
              { MONGODB_LOG_PATH: undefined },
              { mongodbLogPath: 'stdout' }
            );
            expect(loggerOptions.logDestination).to.equal('stdout');
          });
        });
      });
    });
  });
});
