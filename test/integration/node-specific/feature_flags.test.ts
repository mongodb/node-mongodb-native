import { expect } from 'chai';

import { MongoClient, SeverityLevel } from '../../mongodb';

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
  // TODO(NODE-5672): Release Standardized Logger
  describe('@@mdb.enableMongoLogger', () => {
    let cachedEnv;
    const loggerFeatureFlag = Symbol.for('@@mdb.enableMongoLogger');

    before(() => {
      cachedEnv = process.env;
    });

    after(() => {
      process.env = cachedEnv;
    });

    describe('when enabled', () => {
      describe('when logging is enabled for any component', () => {
        before(() => {
          process.env.MONGODB_LOG_COMMAND = SeverityLevel.EMERGENCY;
        });

        it('enables logging for the specified component', () => {
          const client = new MongoClient('mongodb://localhost:27017', {
            [loggerFeatureFlag]: true
          });
          expect(client.mongoLogger?.componentSeverities).to.have.property(
            'command',
            SeverityLevel.EMERGENCY
          );
        });
      });

      describe('when logging is not enabled for any component', () => {
        before(() => {
          process.env = {};
        });

        it('does not create logger', () => {
          const client = new MongoClient('mongodb://localhost:27017', {
            [loggerFeatureFlag]: true
          });
          expect(client.mongoLogger).to.not.exist;
        });
      });
    });
    for (const featureFlagValue of [false, undefined]) {
      describe(`when set to ${featureFlagValue}`, () => {
        describe('when logging is enabled for a component', () => {
          before(() => {
            process.env['MONGODB_LOG_COMMAND'] = SeverityLevel.EMERGENCY;
          });

          it('does not instantiate logger', () => {
            const client = new MongoClient('mongodb://localhost:27017', {
              [loggerFeatureFlag]: featureFlagValue
            });
            expect(client.mongoLogger).to.not.exist;
          });
        });

        describe('when logging is not enabled for any component', () => {
          before(() => {
            process.env = {};
          });

          it('does not instantiate logger', () => {
            const client = new MongoClient('mongodb://localhost:27017', {
              [loggerFeatureFlag]: featureFlagValue
            });
            expect(client.mongoLogger).to.not.exist;
          });
        });
      });
    }
  });

  describe('@@mdb.internalLoggerConfig', () => {
    let cachedEnv: NodeJS.ProcessEnv;

    before(() => {
      cachedEnv = process.env;
    });

    after(() => {
      process.env = cachedEnv;
    });

    describe('when undefined', function () {
      before(() => {
        process.env.MONGODB_LOG_COMMAND = SeverityLevel.EMERGENCY;
      });

      it('falls back to environment options', function () {
        const client = new MongoClient('mongodb://localhost:27017', {
          [Symbol.for('@@mdb.enableMongoLogger')]: true,
          [Symbol.for('@@mdb.internalLoggerConfig')]: undefined
        });
        expect(client.mongoLogger?.componentSeverities).to.have.property(
          'command',
          SeverityLevel.EMERGENCY
        );
      });
    });

    describe('when defined', function () {
      it('overrides environment options', function () {
        const client = new MongoClient('mongodb://localhost:27017', {
          [Symbol.for('@@mdb.enableMongoLogger')]: true,
          [Symbol.for('@@mdb.internalLoggerConfig')]: {
            MONGODB_LOG_COMMAND: SeverityLevel.ALERT
          }
        });
        expect(client.mongoLogger?.componentSeverities).to.have.property(
          'command',
          SeverityLevel.ALERT
        );
      });
    });
  });
});
