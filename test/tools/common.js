'use strict';

const mock = require('./mongodb-mock/index');
const BSON = require('../../src/bson');
const { LEGACY_HELLO_COMMAND } = require('../../src/constants');
const { isHello } = require('../../src/utils');

class ReplSetFixture {
  constructor() {
    this.electionIds = [new BSON.ObjectId(), new BSON.ObjectId()];
  }

  uri(dbName) {
    return `mongodb://${this.primaryServer.uri()},${this.firstSecondaryServer.uri()},${this.secondSecondaryServer.uri()}/${
      dbName || 'test'
    }?replicaSet=rs`;
  }

  setup(options) {
    options = options || {};
    const hello = options[LEGACY_HELLO_COMMAND] ? options[LEGACY_HELLO_COMMAND] : mock.HELLO;

    return Promise.all([
      mock.createServer(),
      mock.createServer(),
      mock.createServer(),
      mock.createServer()
    ]).then(servers => {
      this.servers = servers;
      this.primaryServer = servers[0];
      this.firstSecondaryServer = servers[1];
      this.secondSecondaryServer = servers[2];
      this.arbiterServer = servers[3];

      this.defaultFields = Object.assign({}, hello, {
        __nodejs_mock_server__: true,
        setName: 'rs',
        setVersion: 1,
        electionId: this.electionIds[0],
        hosts: this.servers.map(server => server.uri()),
        arbiters: [this.arbiterServer.uri()]
      });

      if (!options.doNotInitStates) this.defineReplSetStates();
      if (!options.doNotInitHandlers) this.configureMessageHandlers();
    });
  }

  defineReplSetStates() {
    this.primaryStates = [
      Object.assign({}, this.defaultFields, {
        [LEGACY_HELLO_COMMAND]: true,
        secondary: false,
        me: this.primaryServer.uri(),
        primary: this.primaryServer.uri(),
        tags: { loc: 'ny' }
      })
    ];

    this.firstSecondaryStates = [
      Object.assign({}, this.defaultFields, {
        [LEGACY_HELLO_COMMAND]: false,
        secondary: true,
        me: this.firstSecondaryServer.uri(),
        primary: this.primaryServer.uri(),
        tags: { loc: 'sf' }
      })
    ];

    this.secondSecondaryStates = [
      Object.assign({}, this.defaultFields, {
        [LEGACY_HELLO_COMMAND]: false,
        secondary: true,
        me: this.secondSecondaryServer.uri(),
        primary: this.primaryServer.uri(),
        tags: { loc: 'la' }
      })
    ];

    this.arbiterStates = [
      Object.assign({}, this.defaultFields, {
        [LEGACY_HELLO_COMMAND]: false,
        secondary: false,
        arbiterOnly: true,
        me: this.arbiterServer.uri(),
        primary: this.primaryServer.uri()
      })
    ];
  }

  configureMessageHandlers() {
    this.primaryServer.setMessageHandler(request => {
      var doc = request.document;
      if (isHello(doc)) {
        request.reply(this.primaryStates[0]);
      }
    });

    this.firstSecondaryServer.setMessageHandler(request => {
      var doc = request.document;
      if (isHello(doc)) {
        request.reply(this.firstSecondaryStates[0]);
      }
    });

    this.arbiterServer.setMessageHandler(request => {
      var doc = request.document;
      if (isHello(doc)) {
        request.reply(this.arbiterStates[0]);
      }
    });
  }
}

/**
 * Creates a cluster time for use in unit testing cluster time gossiping and
 * causal consistency.
 *
 * @param {number} time the logical time
 * @returns a cluster time according to the driver sessions specification
 */
function genClusterTime(time) {
  return {
    clusterTime: new BSON.Timestamp(time),
    signature: { hash: new BSON.Binary('test'), keyId: new BSON.Long(1) }
  };
}

function sessionCleanupHandler(session, sessionPool, done) {
  return err => {
    if (session == null) {
      sessionPool.endAllPooledSessions();
      done();
      return;
    }

    if (session.hasEnded) {
      sessionPool.endAllPooledSessions();
      done(err);
      return;
    }

    session.endSession(() => {
      sessionPool.endAllPooledSessions();
      done(err);
    });
  };
}

module.exports = {
  ReplSetFixture: ReplSetFixture,
  genClusterTime: genClusterTime,
  sessionCleanupHandler
};
