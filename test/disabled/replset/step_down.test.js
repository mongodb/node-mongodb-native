'use strict';

const expect = require('chai').expect;
const ReplSet = require('../../../../src/core/topologies/replset');
const mock = require('mongodb-mock-server');
const ReplSetFixture = require('../common').ReplSetFixture;

describe('Step Down (ReplSet)', function () {
  class MyFixture extends ReplSetFixture {
    constructor() {
      super();
      this.stateCounter = 0;
    }

    nextState() {
      this.stateCounter += 1;
    }

    defineReplSetStates() {
      super.defineReplSetStates();

      const ps = this.primaryStates[0];
      const ss = this.firstSecondaryStates[0];
      const newPrimary = this.firstSecondaryServer.uri();

      this.primaryStates.push(
        Object.assign({}, ps, {
          ismaster: false,
          primary: ''
        })
      );

      this.primaryStates.push(
        Object.assign({}, ps, {
          ismaster: false,
          secondary: true,
          primary: newPrimary
        })
      );

      this.firstSecondaryStates.push(
        Object.assign({}, ss, {
          primary: ''
        })
      );

      this.firstSecondaryStates.push(
        Object.assign({}, ss, {
          ismaster: true,
          primary: newPrimary
        })
      );
    }

    configureMessageHandlers() {
      const makeMessageHandler = states => request => {
        const state = states[this.stateCounter % states.length];
        const doc = request.document;
        if (doc.ismaster || doc.hello) {
          return request.reply(state);
        }

        if (doc.insert) {
          if (state.primary === state.me) {
            return request.reply({
              ok: 1
            });
          } else {
            return request.reply({
              ok: 0,
              errmsg: 'not master',
              code: 10107
            });
          }
        }
      };

      this.primaryServer.setMessageHandler(makeMessageHandler(this.primaryStates));
      this.firstSecondaryServer.setMessageHandler(makeMessageHandler(this.firstSecondaryStates));
      this.arbiterServer.setMessageHandler(makeMessageHandler(this.arbiterStates));
    }
  }

  let test;
  beforeEach(() => (test = new MyFixture()));
  afterEach(() => mock.cleanup());
  beforeEach(() => test.setup());

  function makeReplicaSet() {
    return new ReplSet([test.primaryServer.address(), test.firstSecondaryServer.address()], {
      setName: 'rs',
      connectionTimeout: 3000,
      socketTimeout: 0,

      size: 1
    });
  }

  it('Should only issue a "not master" error once', {
    metadata: {
      requires: {
        topology: 'single'
      }
    },
    test: function (done) {
      const replSet = makeReplicaSet();

      replSet.on('error', done);
      replSet.on('connect', () => {
        const cleanupAndDone = e => {
          replSet.destroy();
          done(e);
        };

        // Should successfully insert since we have a primary
        replSet.insert('foo.bar', [{ a: 1 }], function (err, result) {
          try {
            expect(err).to.not.exist;
            expect(result).to.exist;
          } catch (e) {
            return cleanupAndDone(e);
          }

          test.nextState();

          // Should issue a "not master", since primary has stepped down
          replSet.insert('foo.bar', [{ b: 2 }], function (err, result) {
            try {
              expect(err).to.exist;
              expect(err.message).to.match(/not master/);
              expect(result).to.not.exist;
            } catch (e) {
              return cleanupAndDone(e);
            }

            // Should issue a "no primary server found", as monitoring has not
            // found a new primary
            replSet.insert('foo.bar', [{ b: 2 }], function (err, result) {
              try {
                expect(err).to.exist;
                expect(err.message).to.match(/no primary server found/);
                expect(result).to.not.exist;
              } catch (e) {
                return cleanupAndDone(e);
              }

              test.nextState();

              setTimeout(() => {
                // Now that we have given time for SDAM, insert should succeed
                replSet.insert('foo.bar', [{ c: 3 }], function (err, result) {
                  try {
                    expect(err).to.not.exist;
                    expect(result).to.exist;
                  } catch (e) {
                    return cleanupAndDone(e);
                  }

                  cleanupAndDone();
                });
              }, 2000);
            });
          });
        });
      });
      replSet.connect();
    }
  });

  it('Should only attempt to remove primary once', {
    metadata: {
      requires: {
        topology: 'single'
      }
    },
    test: function (done) {
      const replSet = makeReplicaSet();

      replSet.on('error', done);
      replSet.on('connect', () => {
        const cleanupAndDone = e => {
          replSet.destroy();
          done(e);
        };

        test.nextState();

        let counter = 2;

        function handler(err, result) {
          counter -= 1;
          try {
            expect(err).to.exist;
            expect(err.message).to.match(/not master/);
            expect(result).to.not.exist;
          } catch (e) {
            return cleanupAndDone(e);
          }

          if (counter <= 0) {
            cleanupAndDone();
          }
        }

        // Should issue a "not master", since primary has stepped down
        // This one will attempt to remove the primary
        replSet.insert('foo.bar', [{ b: 2 }], handler);

        // Should issue a "not master", since primary has stepped down
        // This one will not attempt to remove the primary, as it has
        // already been removed
        replSet.insert('foo.bar', [{ c: 3 }], handler);
      });
      replSet.connect();
    }
  });
});
