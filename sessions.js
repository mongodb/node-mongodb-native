'use strict';

const Binary = require('mongodb-core').BSON.Binary,
  uuidV4 = require('./utils').uuidV4;

/**
 *
 */
class ClientSession {
  constructor(topology, options) {
    if (topology == null) {
      throw new Error('ClientSession requires a topology');
    }

    this.topology = topology;
    this.options = options || {};
    this.hasEnded = false;
    this._serverSession = undefined; // TBD
  }

  /**
   *
   */
  endSession(callback) {
    if (this.hasEnded) {
      return callback(null, null);
    }

    this.topology.command('admin.$cmd', { endSessions: 1, ids: [this.id] }, err => {
      this.hasEnded = true;

      if (err) return callback(err, null);
      callback(null, null);
    });
  }
}

/**
 *
 */
class ServerSession {
  constructor() {
    this.id = { id: new Binary(uuidV4(), Binary.SUBTYPE_UUID) };
    this.lastUse = Date.now();
  }

  /**
   *
   * @param {*} sessionTimeoutMinutes
   */
  hasTimedOut(sessionTimeoutMinutes) {
    const idleTimeMinutes = Math.round(
      (((Date.now() - this.lastUse) % 86400000) % 3600000) / 60000
    );

    return idleTimeMinutes > sessionTimeoutMinutes;
  }
}

/**
 *
 */
class ServerSessionPool {
  constructor(topology) {
    this.topology = topology;
    this.sessions = [];
  }

  /**
   * @returns {ServerSession}
   */
  dequeue() {
    const sessionTimeoutMinutes = this.topology.logicalSessionTimeoutMinutes;
    while (this.sessions.length) {
      const session = this.sessions.shift();
      if (!session.hasTimedOut(sessionTimeoutMinutes)) {
        return session;
      }
    }

    return new ServerSession();
  }

  /**
   *
   * @param {*} session
   */
  enqueue(session) {
    const sessionTimeoutMinutes = this.topology.logicalSessionTimeoutMinutes;
    while (this.sessions.length) {
      const session = this.sessions[this.sessions.length - 1];
      if (session.hasTimedOut(sessionTimeoutMinutes)) {
        this.sessions.pop();
      } else {
        break;
      }
    }

    this.sessions.push(session);
  }
}

module.exports = {
  ClientSession: ClientSession,
  ServerSession: ServerSession,
  ServerSessionPool: ServerSessionPool
};
