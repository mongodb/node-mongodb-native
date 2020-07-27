import { ServerType } from '../../sdam/common';
import { TopologyDescription } from '../../sdam/topology_description';
import { ReadPreference } from '../../read_preference';
import { MongoError } from '../../error';
import type { Document } from '../../types';
import type { CommandOptions } from './command';
import type { QueryOptions } from '../commands';
import type { Topology } from '../../sdam/topology';
import type { Server } from '../../sdam/server';
import type { ServerDescription } from '../../sdam/server_description';

export interface FindOptions {
  readPreference?: ReadPreference;
}

export function getReadPreference(cmd: Document, options: FindOptions): ReadPreference {
  // Default to command version of the readPreference
  let readPreference = cmd.readPreference || new ReadPreference('primary');
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

export function applyCommonQueryOptions(
  queryOptions: QueryOptions,
  options: CommandOptions
): QueryOptions {
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

export function isSharded(topologyOrServer: Topology | Server): boolean {
  if (((topologyOrServer as unknown) as ServerDescription).type === 'mongos') {
    return true;
  }

  if (topologyOrServer.description && topologyOrServer.description.type === ServerType.Mongos) {
    return true;
  }

  // NOTE: This is incredibly inefficient, and should be removed once command construction
  //       happens based on `Server` not `Topology`.
  if (topologyOrServer.description && topologyOrServer.description instanceof TopologyDescription) {
    const servers: ServerDescription[] = Array.from(topologyOrServer.description.servers.values());
    return servers.some((server: ServerDescription) => server.type === ServerType.Mongos);
  }

  return false;
}
