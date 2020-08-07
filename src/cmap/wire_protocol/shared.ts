import { ServerType } from '../../sdam/common';
import { TopologyDescription } from '../../sdam/topology_description';
import { MongoError } from '../../error';
import { ReadPreference } from '../../read_preference';
import type { Document } from '../../types';
import type { CommandOptions } from './command';
import type { OpQueryOptions } from '../commands';
import type { Topology } from '../../sdam/topology';
import type { Server } from '../../sdam/server';
import type { ServerDescription } from '../../sdam/server_description';
import type { ReadPreferenceLike } from '../../read_preference';

export interface ReadPreferenceOption {
  readPreference?: ReadPreferenceLike;
}

export function getReadPreference(cmd: Document, options: ReadPreferenceOption): ReadPreference {
  // Default to command version of the readPreference
  let readPreference = cmd.readPreference || ReadPreference.primary;
  // If we have an option readPreference override the command one
  if (options.readPreference) {
    readPreference = options.readPreference;
  }

  if (typeof readPreference === 'string') {
    readPreference = ReadPreference.fromString(readPreference);
  }

  if (!(readPreference instanceof ReadPreference)) {
    throw new MongoError('read preference must be a ReadPreference instance');
  }

  return readPreference;
}

export function applyCommonQueryOptions(
  queryOptions: OpQueryOptions,
  options: CommandOptions
): OpQueryOptions {
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

export function isSharded(topologyOrServer: Topology | Server): boolean {
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
