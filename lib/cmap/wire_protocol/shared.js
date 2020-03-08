'use strict';

const { ServerType } = require('../../sdam/common');
const { TopologyDescription } = require('../../sdam/topology_description');
const ReadPreference = require('../../read_preference');
const { MongoError } = require('../../error');

var getReadPreference = function(cmd, options) {
  // Default to command version of the readPreference
  var readPreference = cmd.readPreference || new ReadPreference('primary');
  // If we have an option readPreference override the command one
  if (options.readPreference) {
    readPreference = options.readPreference;
  }

  if (typeof readPreference === 'string') {
    readPreference = new ReadPreference(readPreference);
  }

  if (!(readPreference instanceof ReadPreference)) {
    throw new MongoError('read preference must be a ReadPreference instance');
  }

  return readPreference;
};

function applyCommonQueryOptions(queryOptions, options) {
  Object.assign(queryOptions, {
    raw: typeof options.raw === 'boolean' ? options.raw : false,
    promoteLongs: typeof options.promoteLongs === 'boolean' ? options.promoteLongs : true,
    promoteValues: typeof options.promoteValues === 'boolean' ? options.promoteValues : true,
    promoteBuffers: typeof options.promoteBuffers === 'boolean' ? options.promoteBuffers : false,
    monitoring: typeof options.monitoring === 'boolean' ? options.monitoring : false,
    fullResult: typeof options.fullResult === 'boolean' ? options.fullResult : false
  });

  if (typeof options.socketTimeout === 'number') {
    queryOptions.socketTimeout = options.socketTimeout;
  }

  if (options.session) {
    queryOptions.session = options.session;
  }

  if (typeof options.documentsReturnedIn === 'string') {
    queryOptions.documentsReturnedIn = options.documentsReturnedIn;
  }

  return queryOptions;
}

function isSharded(topologyOrServer) {
  if (topologyOrServer.type === 'mongos') return true;
  if (topologyOrServer.description && topologyOrServer.description.type === ServerType.Mongos) {
    return true;
  }

  // NOTE: This is incredibly inefficient, and should be removed once command construction
  //       happens based on `Server` not `Topology`.
  if (topologyOrServer.description && topologyOrServer.description instanceof TopologyDescription) {
    const servers = Array.from(topologyOrServer.description.servers.values());
    return servers.some(server => server.type === ServerType.Mongos);
  }

  return false;
}

module.exports = {
  getReadPreference,
  applyCommonQueryOptions,
  isSharded
};
