import { ServerType } from '../../sdam/common';
import { TopologyDescription } from '../../sdam/topology_description';
import ReadPreference = require('../../read_preference');
import { MongoError } from '../../error';
import type { Document } from '../../types';
import type { CommandOptions } from '../types';

export function getReadPreference(cmd: Document, options: CommandOptions) {
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
}

export function applyCommonQueryOptions(queryOptions: any, options: CommandOptions) {
  Object.assign(queryOptions, {
    raw: options.raw ?? false,
    promoteLongs: options.promoteLongs ?? true,
    promoteValues: options.promoteValues ?? true,
    promoteBuffers: options.promoteBuffers ?? false,
    monitoring: options.monitoring ?? false,
    fullResult: options.fullResult ?? false
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

export function isSharded(topologyOrServer: any) {
  if (topologyOrServer.type === 'mongos') return true;
  if (topologyOrServer.description && topologyOrServer.description.type === ServerType.Mongos) {
    return true;
  }

  // NOTE: This is incredibly inefficient, and should be removed once command construction
  //       happens based on `Server` not `Topology`.
  if (topologyOrServer.description && topologyOrServer.description instanceof TopologyDescription) {
    const servers = Array.from(topologyOrServer.description.servers.values());
    return servers.some((server: any) => server.type === ServerType.Mongos);
  }

  return false;
}
