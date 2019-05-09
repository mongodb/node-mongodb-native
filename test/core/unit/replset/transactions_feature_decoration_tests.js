'use strict';

const expect = require('chai').expect;
const ReplSet = require('../../../../lib/topologies/replset');
const mock = require('mongodb-mock-server');
const ReplSetFixture = require('../common').ReplSetFixture;
const ClientSession = require('../../../../lib/sessions').ClientSession;
const ServerSessionPool = require('../../../../lib/sessions').ServerSessionPool;

describe('Transaction Feature Decoration', function() {
  let test;
  const ns = 'db.foo';
  const noop = () => {};
  const ismaster = Object.assign({}, mock.DEFAULT_ISMASTER_36, { maxWireVersion: 7 });

  before(() => (test = new ReplSetFixture()));
  afterEach(() => mock.cleanup());
  beforeEach(() => test.setup({ ismaster }));

  class TestConfig {
    constructor(config, flags) {
      this.fnName = config.fnName;
      this.cmd = config.cmd;
      this.arg = config.arg();
      this.flags = flags;
      this.retryWrites = flags.retryWrites;
      this.session = flags.session;
      this.transaction = flags.transaction;
    }

    get shouldPass() {
      if (this.session && this.transaction) {
        return true;
      }

      if (this.fnName === 'command') {
        return false;
      }

      return this.session && this.retryWrites;
    }

    get description() {
      const not = this.shouldPass ? '' : 'not ';
      const flags = JSON.stringify(this.flags);

      return `should ${not}have a txnNumber when command ${this.cmd} is used with ${flags}`;
    }
  }

  [
    { fnName: 'insert', cmd: 'insert', arg: () => [{ foo: 1 }] },
    { fnName: 'update', cmd: 'update', arg: () => [{ foo: 1 }] },
    { fnName: 'remove', cmd: 'delete', arg: () => [{ foo: 1 }] },
    { fnName: 'command', cmd: 'fizzBuzz', arg: () => ({ fizzBuzz: 1 }) }
  ]
    .reduce((testConfigs, op) => {
      for (let i = 0; i < 4; i += 1) {
        const options = {
          retryWrites: i % 2 === 1,
          session: i >= 2
        };

        testConfigs.push(new TestConfig(op, options));

        if (options.session) {
          testConfigs.push(new TestConfig(op, Object.assign({ transaction: true }, options)));
        }
      }
      return testConfigs;
    }, [])
    .forEach(config => {
      it(config.description, {
        metadata: { requires: { topology: 'single', mongodb: '>=3.7.3' } },
        test: function(done) {
          const replSet = new ReplSet(
            [test.primaryServer.address(), test.firstSecondaryServer.address()],
            {
              setName: 'rs',
              connectionTimeout: 3000,
              socketTimeout: 0,
              haInterval: 100,
              size: 1
            }
          );

          function shutdown(err) {
            replSet.destroy();
            done(err);
          }

          test.primaryServer.setMessageHandler(request => {
            try {
              const doc = request.document;

              if (doc.ismaster) {
                return request.reply(test.primaryStates[0]);
              }

              if (doc[config.cmd]) {
                if (config.shouldPass) {
                  expect(doc).to.have.property('txnNumber');
                } else {
                  expect(doc).to.not.have.property('txnNumber');
                }

                request.reply({ ok: 1 });

                setTimeout(() => shutdown());
              }
            } catch (e) {
              return shutdown(e);
            }
          });

          const sessionPool = new ServerSessionPool(replSet);

          replSet.on('connect', () => {
            const options = {};

            if (config.retryWrites) {
              options.retryWrites = true;
            }

            if (config.session) {
              options.session = new ClientSession(replSet, sessionPool, {}, {});

              if (config.transaction) {
                options.session.startTransaction();
              }
            }

            replSet[config.fnName](ns, config.arg, options, noop);
          });

          replSet.on('error', shutdown);

          replSet.connect();
        }
      });
    });
});
