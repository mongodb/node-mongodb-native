import { expect } from 'chai';

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

  describe('@@mdb.enableMongoLogger', () => {});
});
