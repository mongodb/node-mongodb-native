'use strict';
const mongo = require('../..'),
  setupDatabase = require('./shared').setupDatabase,
  expect = require('chai').expect;

const ignoredCommands = ['ismaster', 'endSessions'];
const test = { commands: { started: [], succeeded: [] } };
describe('Causal Consistency', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  afterEach(() => test.listener.uninstrument());
  beforeEach(function() {
    test.commands = { started: [], succeeded: [] };
    test.listener = mongo.instrument(err => expect(err).to.be.null);
    test.listener.on('started', event => {
      if (ignoredCommands.indexOf(event.commandName) === -1) test.commands.started.push(event);
    });

    test.listener.on('succeeded', event => {
      if (ignoredCommands.indexOf(event.commandName) === -1) test.commands.succeeded.push(event);
    });

    test.client = this.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
    return test.client.connect();
  });

  it('should not send `afterClusterTime` on first read operation in a causal session', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>3.6.0-rc0' } },

    test: function() {
      const session = test.client.startSession({ causalConsistency: true });
      const db = test.client.db(this.configuration.db);

      return db
        .collection('causal_test')
        .findOne({}, { session: session })
        .then(() => {
          expect(test.commands.started).to.have.length(1);
          expect(test.commands.succeeded).to.have.length(1);

          const findCommand = test.commands.started[0];
          expect(findCommand).to.not.have.key('readConcern');
        });
    }
  });

  it('should update `operationTime` on session on first read', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>3.6.0-rc0' } },

    test: function() {
      const session = test.client.startSession({ causalConsistency: true });
      const db = test.client.db(this.configuration.db);
      expect(session.operationTime).to.be.null;

      return db
        .collection('causal_test')
        .findOne({}, { session: session })
        .then(() => {
          expect(test.commands.started).to.have.length(1);
          expect(test.commands.succeeded).to.have.length(1);

          const lastReply = test.commands.succeeded[0].reply;
          expect(session.operationTime).to.equal(lastReply.operationTime);
        });
    }
  });

  // TODO: this should be repeated for all potential read operations
  it('should include `afterClusterTime` on more than one read operation', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>3.6.0-rc0' } },

    test: function() {
      const session = test.client.startSession({ causalConsistency: true });
      const db = test.client.db(this.configuration.db);
      expect(session.operationTime).to.be.null;

      let firstOperationTime;
      return db
        .collection('causal_test')
        .findOne({}, { session: session })
        .then(() => {
          const firstFindCommand = test.commands.started[0].command;
          expect(firstFindCommand).to.not.have.key('readConcern');
          firstOperationTime = test.commands.succeeded[0].reply.operationTime;

          return db.collection('causal_test').findOne({}, { session: session });
        })
        .then(() => {
          const secondFindCommand = test.commands.started[1].command;
          expect(secondFindCommand).to.have.any.key('readConcern');
          expect(secondFindCommand.readConcern).to.have.any.key('afterClusterTime');
          expect(secondFindCommand.readConcern.afterClusterTime).to.eql(firstOperationTime);
        });
    }
  });

  it(
    'should not include `afterClusterTime` on read operations in a session without causal consistency',
    {
      metadata: { requires: { topology: ['replicaset'], mongodb: '>3.6.0-rc0' } },

      test: function() {
        const session = test.client.startSession({ causalConsistency: false });
        const db = test.client.db(this.configuration.db);
        const coll = db.collection('causal_test', { readConcern: { level: 'majority' } });

        return coll
          .findOne({}, { session: session })
          .then(() => coll.findOne({}, { session: session }))
          .then(() => {
            const command = test.commands.started[1].command;
            expect(command).to.have.any.key('readConcern');
            expect(command.readConcern).to.not.have.any.key('afterClusterTime');
          });
      }
    }
  );

  // TODO: this should be repeated for all potential read/write operations
  it('should include `afterClusterTime` on read operation after write operation', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>3.6.0-rc0' } },

    test: function() {
      const session = test.client.startSession({ causalConsistency: true });
      const db = test.client.db(this.configuration.db);
      expect(session.operationTime).to.be.null;

      let firstOperationTime;
      return db
        .collection('causal_test')
        .insert({}, { session: session })
        .then(() => {
          firstOperationTime = test.commands.succeeded[0].reply.operationTime;
          return db.collection('causal_test').findOne({}, { session: session });
        })
        .then(() => {
          const secondFindCommand = test.commands.started[1].command;
          expect(secondFindCommand).to.have.any.key('readConcern');
          expect(secondFindCommand.readConcern).to.have.any.key('afterClusterTime');
          expect(secondFindCommand.readConcern.afterClusterTime).to.eql(firstOperationTime);
        });
    }
  });

  it(
    'should not include `afterClusterTime` on read operations on a deployment which does not support clusterTime',
    {
      metadata: { requires: { topology: ['single'], mongodb: '>3.6.0-rc0' } },

      test: function() {
        const db = test.client.db(this.configuration.db);
        const coll = db.collection('causal_test', { readConcern: { level: 'local' } });

        return coll
          .findOne({})
          .then(() => coll.findOne({}))
          .then(() => {
            const command = test.commands.started[1].command;
            expect(command).to.have.any.key('readConcern');
            expect(command.readConcern).to.not.have.any.key('afterClusterTime');
          });
      }
    }
  );

  // NOTE: this is likely to change such that unacknowledged writes are required to use an
  //       implicit session.
  it.skip(
    'should not record `operationTime` for unacknowledged writes in a causally consistent session',
    {
      metadata: { requires: { topology: ['replicaset'], mongodb: '>3.6.0-rc0' } },
      test: function() {
        const session = test.client.startSession({ causalConsistency: true });
        const db = test.client.db(this.configuration.db);
        expect(session.operationTime).to.be.null;

        return db
          .collection('causal_test')
          .insert({}, { session: session, w: 0 })
          .then(() => {
            expect(session.operationTime).to.be.null;
          });
      }
    }
  );
});
