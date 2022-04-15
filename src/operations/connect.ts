import { resolveSRVRecord } from '../connection_string';
import { MONGO_CLIENT_EVENTS } from '../constants';
import { MongoInvalidArgumentError, MongoRuntimeError } from '../error';
import type { MongoClient, MongoOptions } from '../mongo_client';
import { Topology } from '../sdam/topology';
import type { Callback } from '../utils';

export function connect(
  mongoClient: MongoClient,
  options: MongoOptions,
  callback: Callback<MongoClient>
): void {
  if (!callback) {
    throw new MongoInvalidArgumentError('Callback function must be provided');
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
      // TODO(NODE-3483)
      return callback(new MongoRuntimeError(warningMessage));
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

  topology.once(Topology.OPEN, () => mongoClient.emit('open', mongoClient));

  for (const event of MONGO_CLIENT_EVENTS) {
    topology.on(event, (...args: any[]) => mongoClient.emit(event, ...(args as any)));
  }

  // initialize CSFLE if requested
  if (mongoClient.autoEncrypter) {
    mongoClient.autoEncrypter.init(err => {
      if (err) {
        return callback(err);
      }

      topology.connect(options, err => {
        if (err) {
          topology.close({ force: true });
          return callback(err);
        }

        options.encrypter.connectInternalClient(error => {
          if (error) return callback(error);

          callback(undefined, topology);
        });
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
