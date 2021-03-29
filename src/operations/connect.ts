import { MongoError } from '../error';
import { Topology } from '../sdam/topology';
import { resolveSRVRecord } from '../connection_string';
import type { Callback } from '../utils';
import { CMAP_EVENT_NAMES } from '../cmap/connection_pool';
import * as BSON from '../bson';
import type { MongoClient, MongoOptions } from '../mongo_client';
import { Connection } from '../cmap/connection';
import { Server } from '../sdam/server';
import type { AutoEncrypter } from '../deps';

export function connect(
  mongoClient: MongoClient,
  options: MongoOptions,
  callback: Callback<MongoClient>
): void {
  if (!callback) {
    throw new Error('no callback function provided');
  }

  // If a connection already been established, we can terminate early
  if (mongoClient.topology && mongoClient.topology.isConnected()) {
    return callback(undefined, mongoClient);
  }

  const logger = mongoClient.logger;
  const connectCallback: Callback = err => {
    const warningMessage =
      'seed list contains no mongos proxies, replicaset connections requires ' +
      'the parameter replicaSet to be supplied in the URI or options object, ' +
      'mongodb://server:port/db?replicaSet=name';
    if (err && err.message === 'no mongos proxies found in seed list') {
      if (logger.isWarn()) {
        logger.warn(warningMessage);
      }

      // Return a more specific error message for MongoClient.connect
      return callback(new MongoError(warningMessage));
    }

    callback(err, mongoClient);
  };

  if (typeof options.srvHost === 'string') {
    return resolveSRVRecord(options, (err, hosts) => {
      if (err || !hosts) return callback(err);
      for (const [index, host] of hosts.entries()) {
        options.hosts[index] = host;
      }

      return createTopology(mongoClient, options, connectCallback);
    });
  }

  return createTopology(mongoClient, options, connectCallback);
}

export type ListenerFunction<V1 = unknown, V2 = unknown> = (v1: V1, v2: V2) => boolean;

function createListener<V1, V2>(mongoClient: MongoClient, event: string): ListenerFunction<V1, V2> {
  const eventSet = new Set(['all', 'fullsetup', 'open', 'reconnect']);
  return (v1, v2) => {
    if (eventSet.has(event)) {
      return mongoClient.emit(event, mongoClient);
    }

    return mongoClient.emit(event, v1, v2);
  };
}

/**
 * If AutoEncryption is requested, handles the optional dependency logic and passing through options
 * returns undefined if CSFLE is not enabled.
 * @throws if optional 'mongodb-client-encryption' dependency missing
 */
export function createAutoEncrypter(
  client: MongoClient,
  options: MongoOptions
): AutoEncrypter | undefined {
  if (!options.autoEncryption) {
    return;
  }
  try {
    require.resolve('mongodb-client-encryption');
  } catch (err) {
    throw new MongoError(
      'Auto-encryption requested, but the module is not installed. ' +
        'Please add `mongodb-client-encryption` as a dependency of your project'
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mongodbClientEncryption = require('mongodb-client-encryption');
  if (typeof mongodbClientEncryption.extension !== 'function') {
    throw new MongoError(
      'loaded version of `mongodb-client-encryption` does not have property `extension`. ' +
        'Please make sure you are loading the correct version of `mongodb-client-encryption`'
    );
  }
  const { AutoEncrypter: AutoEncrypterClass } = mongodbClientEncryption.extension(
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../lib/index')
  );

  const mongoCryptOptions = Object.assign({ bson: BSON }, options.autoEncryption);
  return new AutoEncrypterClass(client, mongoCryptOptions);
}

function createTopology(
  mongoClient: MongoClient,
  options: MongoOptions,
  callback: Callback<Topology>
) {
  // Create the topology
  const topology = new Topology(options.hosts, options);
  // Events can be emitted before initialization is complete so we have to
  // save the reference to the topology on the client ASAP if the event handlers need to access it
  mongoClient.topology = topology;

  // Add listeners
  topology.on('error', createListener(mongoClient, 'error'));
  topology.on('timeout', createListener(mongoClient, 'timeout'));
  topology.on('close', createListener(mongoClient, 'close'));
  topology.once('open', createListener(mongoClient, 'open'));

  // Propagate the events to the client
  relayEvents(mongoClient, topology);

  // initialize CSFLE if requested
  if (mongoClient.autoEncrypter) {
    mongoClient.autoEncrypter.init(err => {
      if (err) {
        callback(err);
        return;
      }

      topology.connect(options, err => {
        if (err) {
          topology.close({ force: true });
          callback(err);
          return;
        }

        callback(undefined, topology);
      });
    });

    return;
  }

  // otherwise connect normally
  topology.connect(options, err => {
    if (err) {
      topology.close({ force: true });
      return callback(err);
    }

    callback(undefined, topology);
    return;
  });
}

function relayEvents(mongoClient: MongoClient, topology: Topology) {
  const serverOrCommandEvents = [
    // APM
    Connection.COMMAND_STARTED,
    Connection.COMMAND_SUCCEEDED,
    Connection.COMMAND_FAILED,

    // SDAM
    Topology.SERVER_OPENING,
    Topology.SERVER_CLOSED,
    Topology.SERVER_DESCRIPTION_CHANGED,
    Server.SERVER_HEARTBEAT_STARTED,
    Server.SERVER_HEARTBEAT_SUCCEEDED,
    Server.SERVER_HEARTBEAT_FAILED,
    Topology.TOPOLOGY_OPENING,
    Topology.TOPOLOGY_CLOSED,
    Topology.TOPOLOGY_DESCRIPTION_CHANGED,
    ...CMAP_EVENT_NAMES
  ];

  for (const event of serverOrCommandEvents) {
    topology.on(event, (object1, object2) => {
      mongoClient.emit(event, object1, object2);
    });
  }
}
