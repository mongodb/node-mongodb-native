import { expect } from 'chai';

import { MongoClient } from '../../../src';
import { SeverityLevel } from '../../../src/mongo_logger';

describe('Feature Flags', () => {
  describe('@@mdb.skipPingOnConnect', () => {
    beforeEach(function () {
      if (process.env.AUTH !== 'auth') {
        this.currentTest.skipReason = 'ping count relies on auth to be enabled';
        this.skip();
      }
    });

    const tests = [
      // only skipInitiaPing=true will have no events upon connect
      { description: 'should skip ping command when set to true', value: true, expectEvents: 0 },
      {
        description: 'should not skip ping command when set to false',
        value: false,
        expectEvents: 1
      },
      { description: 'should not skip ping command when unset', value: undefined, expectEvents: 1 }
    ];
    for (const { description, value, expectEvents } of tests) {
      it(description, async function () {
        const options =
          value === undefined ? {} : { [Symbol.for('@@mdb.skipPingOnConnect')]: value };
        const client = this.configuration.newClient({}, { ...options, monitorCommands: true });
        const events = [];
        client.on('commandStarted', event => events.push(event));

        try {
          await client.connect();
        } finally {
          await client.close();
        }

        expect(events).to.have.lengthOf(expectEvents);
        if (expectEvents > 1) {
          for (const event of events) {
            expect(event).to.have.property('commandName', 'ping');
          }
        }
      });
    }
  });

  describe('@@mdb.enableMongoLogger', () => {
    let cachedEnv;
    const loggerFeatureFlag = Symbol.for('@@mdb.enableMongoLogger');
    const severityMethods = [
      'emergency',
      'alert',
      'critical',
      'error',
      'warn',
      'notice',
      'info',
      'debug',
      'trace'
    ];

    before(() => {
      cachedEnv = process.env;
    });

    after(() => {
      process.env = cachedEnv;
    });

    context('when set to true', () => {
      context('when logging for a component is enabled', () => {
        before(() => {
          process.env['MONGODB_LOG_COMMAND'] = SeverityLevel.EMERGENCY;
        });

        for (const severity of severityMethods) {
          context(`${severity} severity logging method`, () => {
            const skipReason =
              severity === SeverityLevel.EMERGENCY
                ? 'TODO(NODE-4813): implement the emergency severity logging method'
                : 'TODO(NODE-4814): implement the remaining severity loggers';
            it.skip('should not be a no-op', () => {
              const client = new MongoClient('mongodb://localhost:27017', {
                [loggerFeatureFlag]: true
              });
              const stringifiedMethod = client.mongoLogger[severity].toString();
              const expectedStringifiedMethod = `${severity}(component, message) { }`;
              expect(stringifiedMethod).to.not.equal(expectedStringifiedMethod);
            }).skipReason = skipReason;
          });
        }
      });

      context('when logging for a component is not enabled', () => {
        before(() => {
          process.env['MONGODB_LOG_COMMAND'] = SeverityLevel.OFF;
        });

        for (const severity of severityMethods) {
          context(`${severity} severity logging method`, () => {
            it('should be a no-op', () => {
              const client = new MongoClient('mongodb://localhost:27017', {
                [loggerFeatureFlag]: true
              });
              const stringifiedMethod = client.mongoLogger[severity].toString();
              const expectedStringifiedMethod = `${severity}(component, message) { }`;
              expect(stringifiedMethod).to.equal(expectedStringifiedMethod);
            });
          });
        }
      });
    });

    for (const featureFlagValue of [false, undefined]) {
      context(`when set to ${featureFlagValue}`, () => {
        context('when logging for a component is enabled', () => {
          before(() => {
            process.env['MONGODB_LOG_COMMAND'] = SeverityLevel.EMERGENCY;
          });

          for (const severity of severityMethods) {
            context(`${severity} severity logging method`, () => {
              it('should be a no-op', () => {
                const client = new MongoClient('mongodb://localhost:27017', {
                  [loggerFeatureFlag]: true
                });
                const stringifiedMethod = client.mongoLogger[severity].toString();
                const expectedStringifiedMethod = `${severity}(component, message) { }`;
                expect(stringifiedMethod).to.equal(expectedStringifiedMethod);
              });
            });
          }
        });

        context('when logging for a component is not enabled', () => {
          before(() => {
            process.env['MONGODB_LOG_COMMAND'] = SeverityLevel.OFF;
          });

          for (const severity of severityMethods) {
            context(`${severity} severity logging method`, () => {
              it('should be a no-op', () => {
                const client = new MongoClient('mongodb://localhost:27017', {
                  [loggerFeatureFlag]: true
                });
                const stringifiedMethod = client.mongoLogger[severity].toString();
                const expectedStringifiedMethod = `${severity}(component, message) { }`;
                expect(stringifiedMethod).to.equal(expectedStringifiedMethod);
              });
            });
          }
        });
      });
    }
  });
});
