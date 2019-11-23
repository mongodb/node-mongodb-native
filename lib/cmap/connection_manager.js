'use strict';

class ConnectionManager {
  constructor() {
    this._totalConnections = new Set();
    this._availableConnections = new Set();
  }

  get totalConnectionCount() {
    return this._totalConnections.size;
  }

  get availableConnectionCount() {
    return this._availableConnections.size;
  }

  add(connection) {
    this._totalConnections.add(connection);
  }

  has(connection) {
    return this._totalConnections.has(connection);
  }

  remove(connections) {
    this._availableConnections.delete(connections);
    this._totalConnections.delete(connections);
  }

  makeAvailable(connection) {
    this._availableConnections.add(connection);
  }

  markInUse(connection) {
    this._availableConnections.delete(connection);
  }

  getAvailable() {
    const connection = this._availableConnections.values().next().value;
    this._availableConnections.delete(connection);
    return connection;
  }
}

module.exports = { ConnectionManager };
