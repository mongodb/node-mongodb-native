import { expect } from 'chai';

import { MongoClient } from '../../../src';
import { MongoLogger, SeverityLevel } from '../../../src/mongo_logger';

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

    before(() => {
      cachedEnv = process.env;
    });

    after(() => {
      process.env = cachedEnv;
    });

    context('when logging for a component is enabled', () => {
      before(() => {
        process.env['MONGODB_LOG_COMMAND'] = SeverityLevel.EMERGENCY;
      });

      it('should instantiate a MongoLogger when set to true', () => {
        const client = new MongoClient('mongodb://localhost:27017', { [loggerFeatureFlag]: true });
        expect(client.mongoLogger).to.be.instanceOf(MongoLogger);
      });

      it('should not instantiate a MongoLogger when set to false', () => {
        const client = new MongoClient('mongodb://localhost:27017', { [loggerFeatureFlag]: false });
        expect(client).property('mongoLogger', null);
      });

      it('should not instantiate a MongoLogger when set to undefined', () => {
        const client = new MongoClient('mongodb://localhost:27017', {
          [loggerFeatureFlag]: undefined
        });
        expect(client).property('mongoLogger', null);
      });
    });

    context('when logging for a component is not enabled', () => {
      before(() => {
        process.env['MONGODB_LOG_COMMAND'] = SeverityLevel.OFF;
      });

      for (const featureFlagValue of [true, false, undefined]) {
        it(`should not instantiate a MongoLogger when set to ${featureFlagValue}`, () => {
          const client = new MongoClient('mongodb://localhost:27017', {
            [loggerFeatureFlag]: featureFlagValue
          });
          expect(client).property('mongoLogger', null);
        });
      }
    });
  });
});
