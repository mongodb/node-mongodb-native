'use strict';

var assign = require('../../../lib/utils').assign,
  mock = require('../../mock'),
  ObjectId = require('bson').ObjectId,
  Timestamp = require('bson').Timestamp,
  Binary = require('bson').Binary;

class ReplSetFixture {
  constructor() {
    this.electionIds = [new ObjectId(), new ObjectId()];
  }

  setup() {
    return Promise.all([
      mock.createServer(),
      mock.createServer(),
      mock.createServer()
    ]).then(servers => {
      this.servers = servers;
      this.primaryServer = servers[0];
      this.firstSecondaryServer = servers[1];
      this.arbiterServer = servers[2];

      this.defaultFields = assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: this.electionIds[0],
        hosts: this.servers.map(server => server.uri()),
        arbiters: [this.arbiterServer.uri()]
      });

      this.defineReplSetStates();
      this.configureMessageHandlers();
    });
  }

  defineReplSetStates() {
    this.primaryStates = [
      assign({}, this.defaultFields, {
        ismaster: true,
        secondary: false,
        me: this.primaryServer.uri(),
        primary: this.primaryServer.uri(),
        tags: { loc: 'ny' }
      })
    ];

    this.firstSecondaryStates = [
      assign({}, this.defaultFields, {
        ismaster: false,
        secondary: true,
        me: this.firstSecondaryServer.uri(),
        primary: this.primaryServer.uri(),
        tags: { loc: 'sf' }
      })
    ];

    this.arbiterStates = [
      assign({}, this.defaultFields, {
        ismaster: false,
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
      if (doc.ismaster) {
        request.reply(this.primaryStates[0]);
      }
    });

    this.firstSecondaryServer.setMessageHandler(request => {
      var doc = request.document;
      if (doc.ismaster) {
        request.reply(this.firstSecondaryStates[0]);
      }
    });

    this.arbiterServer.setMessageHandler(request => {
      var doc = request.document;
      if (doc.ismaster) {
        request.reply(this.arbiterStates[0]);
      }
    });
  }
}

/**
 * Creates a cluster time for use in unit testing cluster time gossiping and
 * causal consistency.
 *
 * @param {Number} time the logical time
 * @returns a cluster time according to the driver sessions specification
 */
function genClusterTime(time) {
  return {
    clusterTime: new Timestamp(time),
    signature: {
      hash: new Binary(new Buffer('testing')),
      keyId: 42
    }
  };
}

module.exports = {
  ReplSetFixture: ReplSetFixture,
  genClusterTime: genClusterTime
};
