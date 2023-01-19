import { expect } from 'chai';

import { MongoClient, MongoLoggableComponent, SeverityLevel } from '../../mongodb';

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
    const components: Array<MongoLoggableComponent | 'default'> = [
      'default',
      'topology',
      'serverSelection',
      'connection',
      'command'
    ];

    before(() => {
      cachedEnv = process.env;
    });

    after(() => {
      process.env = cachedEnv;
    });

    context('when enabled', () => {
      context('when logging is enabled for any component', () => {
        before(() => {
          process.env.MONGODB_LOG_COMMAND = SeverityLevel.EMERGENCY;
        });

        it('enables logging for the specified component', () => {
          const client = new MongoClient('mongodb://localhost:27017', {
            [loggerFeatureFlag]: true
          });
          expect(client.mongoLogger.componentSeverities).to.have.property(
            'command',
            SeverityLevel.EMERGENCY
          );
        });
      });

      context('when logging is not enabled for any component', () => {
        before(() => {
          process.env = {};
        });

        it('does not enable logging for any component', () => {
          const client = new MongoClient('mongodb://localhost:27017', {
            [loggerFeatureFlag]: true
          });
          for (const component of components) {
            expect(client.mongoLogger.componentSeverities).to.have.property(
              component,
              SeverityLevel.OFF
            );
          }
        });
      });
    });

    for (const featureFlagValue of [false, undefined]) {
      context(`when set to ${featureFlagValue}`, () => {
        context('when logging is enabled for a component', () => {
          before(() => {
            process.env['MONGODB_LOG_COMMAND'] = SeverityLevel.EMERGENCY;
          });

          it('does not enable logging', () => {
            const client = new MongoClient('mongodb://localhost:27017', {
              [loggerFeatureFlag]: featureFlagValue
            });
            for (const component of components) {
              expect(client.mongoLogger.componentSeverities).to.have.property(
                component,
                SeverityLevel.OFF
              );
            }
          });
        });

        context('when logging is not enabled for any component', () => {
          before(() => {
            process.env = {};
          });

          it('does not enable logging', () => {
            const client = new MongoClient('mongodb://localhost:27017', {
              [loggerFeatureFlag]: featureFlagValue
            });
            for (const component of components) {
              expect(client.mongoLogger.componentSeverities).to.have.property(
                component,
                SeverityLevel.OFF
              );
            }
          });
        });
      });
    }
  });
});
