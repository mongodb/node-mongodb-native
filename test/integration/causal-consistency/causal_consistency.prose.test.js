'use strict';

const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');

const { setupDatabase } = require('../shared');
const { expect } = require('chai');

const ignoredCommands = [LEGACY_HELLO_COMMAND, 'endSessions'];
const test = { commands: { started: [], succeeded: [] } };

// TODO(NODE-3882) - properly implement all prose tests and add missing cases 1, 8, 9, 11, 12
describe('Causal Consistency - prose tests', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  beforeEach(function () {
    test.commands = { started: [], succeeded: [] };
    test.client = this.configuration.newClient(
      { w: 1 },
      { maxPoolSize: 1, monitorCommands: true, __skipPingOnConnect: true }
    );
    test.client.on('commandStarted', event => {
      if (ignoredCommands.indexOf(event.commandName) === -1) test.commands.started.push(event);
    });

    test.client.on('commandSucceeded', event => {
      if (ignoredCommands.indexOf(event.commandName) === -1) test.commands.succeeded.push(event);
    });
  });

  afterEach(() => {
    return test.client ? test.client.close() : Promise.resolve();
  });

  it(
    '2. The first read in a causally consistent session must not send afterClusterTime to the server',
    /**
     * session = client.startSession(causalConsistency = true)
     * document = collection.anyReadOperation(session, ...)
     * capture the command sent to the server (using APM or other mechanism)
     * assert that the command does not have an afterClusterTime
     */
    {
      metadata: {
        requires: { topology: ['replicaset', 'sharded'] }
      },

      test: function () {
        const session = test.client.startSession({ causalConsistency: true });
        const db = test.client.db(this.configuration.db);

        return db
          .collection('causal_test')
          .findOne({}, { session: session })
          .then(() => {
            expect(test.commands.started).to.have.length(1);
            expect(test.commands.succeeded).to.have.length(1);

            const findCommand = test.commands.started[0].command;
            expect(findCommand).to.have.property('find', 'causal_test');
            expect(findCommand).to.not.have.key('readConcern');
          });
      }
    }
  );

  // TODO(NODE-3882): need to do this for one write in addition to the read; and also test with errors
  // TODO(NODE-3882): we also need to run this test without causal consistency
  context(
    '3. The first read or write on a ClientSession should update the operationTime of the ClientSession, even if there is an error',
    () => {
      /**
       * session = client.startSession() // with or without causal consistency
       * collection.anyReadOrWriteOperation(session, ...) // test with errors also if possible
       * capture the response sent from the server (using APM or other mechanism)
       * assert session.operationTime has the same value that is in the response from the server
       */

      it('case: successful read with causal consistency', {
        metadata: {
          requires: { topology: ['replicaset', 'sharded'] }
        },

        test: function () {
          const session = test.client.startSession({ causalConsistency: true });
          const db = test.client.db(this.configuration.db);
          expect(session.operationTime).to.not.exist;

          return db
            .collection('causal_test')
            .findOne({}, { session: session })
            .then(() => {
              expect(test.commands.started).to.have.length(1);
              expect(test.commands.succeeded).to.have.length(1);

              const lastReply = test.commands.succeeded[0].reply;
              const maybeLong = val => (typeof val.equals === 'function' ? val.toNumber() : val);
              expect(maybeLong(session.operationTime)).to.equal(maybeLong(lastReply.operationTime));
            });
        }
      });
    }
  );

  // TODO(NODE-3882): this should be repeated for all potential read operations
  context(
    '4. A findOne followed by any other read operation should include the operationTime returned by the server for the first operation in the afterClusterTime parameter of the second operation',
    /**
     * session = client.startSession(causalConsistency = true) * collection.findOne(session, {})
     * operationTime = session.operationTime * collection.anyReadOperation(session, ...)
     * capture the command sent to the server (using APM or other mechanism)
     * assert that the command has an afterClusterTime field with a value of operationTime
     */
    () => {
      it('case: second operation is findOne', {
        metadata: {
          requires: { topology: ['replicaset', 'sharded'] }
        },

        test: function () {
          const session = test.client.startSession({ causalConsistency: true });
          const db = test.client.db(this.configuration.db);
          expect(session.operationTime).to.not.exist;

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
    }
  );

  // TODO(NODE-3882): implement this for all write operations including the case where the first operation returned an error
  context(
    '5. Any write operation followed by a findOne operation should include the operationTime of the first operation in the afterClusterTime parameter of the second operation',
    /**
     * session = client.startSession(causalConsistency = true)
     * collection.anyWriteOperation(session, ...) // test with errors also where possible
     * operationTime = session.operationTime * collection.findOne(session, {})
     * capture the command sent to the server (using APM or other mechanism)
     * assert that the command has an afterClusterTime field with a value of operationTime
     */
    () => {
      it('case: successful insert', {
        metadata: {
          requires: { topology: ['replicaset', 'sharded'] }
        },

        test: function () {
          const session = test.client.startSession({ causalConsistency: true });
          const db = test.client.db(this.configuration.db);
          expect(session.operationTime).to.not.exist;

          let firstOperationTime;
          return db
            .collection('causal_test')
            .insertOne({}, { session: session })
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
    }
  );

  it(
    '6. A read operation in a ClientSession that is not causally consistent should not include the afterClusterTime parameter in the command sent to the server',
    /**
     * session = client.startSession(causalConsistency = false)
     * collection.anyReadOperation(session, {})
     * operationTime = session.operationTime
     * capture the command sent to the server (using APM or other mechanism)
     * assert that the command does not have an afterClusterTime field
     */
    {
      metadata: {
        requires: { topology: ['replicaset', 'sharded'] }
      },

      test: function () {
        const session = test.client.startSession({ causalConsistency: false });
        const db = test.client.db(this.configuration.db);
        const coll = db.collection('causal_test', { readConcern: { level: 'majority' } });

        return coll
          .findOne({}, { session: session })
          .then(() => coll.findOne({}, { session: session }))
          .then(() => {
            const commands = test.commands.started.map(command => command.command);
            expect(commands).to.have.length(2);
            for (const command of commands) {
              expect(command).to.have.any.key('readConcern');
              expect(command.readConcern).to.not.have.any.key('afterClusterTime');
            }
          });
      }
    }
  );

  it(
    '7. A read operation in a causally consistent session against a deployment that does not support cluster times does not include the afterClusterTime parameter in the command sent to the server',
    /**
     * session = client.startSession(causalConsistency = true)
     * collection.anyReadOperation(session, {})
     * capture the command sent to the server (using APM or other mechanism)
     * assert that the command does not have an afterClusterTime field
     */
    {
      metadata: { requires: { topology: ['single'] } },

      test: function () {
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

  // #10 is removed by DRIVERS-1374/NODE-3883
});
