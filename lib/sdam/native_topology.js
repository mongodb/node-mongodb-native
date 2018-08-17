'use strict';

const Topology = require('mongodb-core').Topology;
const ServerCapabilities = require('./topology_base').ServerCapabilities;

class NativeTopology extends Topology {
  constructor(servers, options) {
    super(servers, options);
  }

  capabilities() {
    if (this.s.sCapabilities) return this.s.sCapabilities;
    if (this.lastIsMaster() == null) return null;
    this.s.sCapabilities = new ServerCapabilities(this.lastIsMaster());
    return this.s.sCapabilities;
  }
}

module.exports = NativeTopology;
