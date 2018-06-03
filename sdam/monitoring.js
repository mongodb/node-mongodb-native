'use strict';

const ServerDescription = require('./server_description').ServerDescription;
const calculateDurationInMs = require('../utils').calculateDurationInMs;

/**
 * Published when server description changes, but does NOT include changes to the RTT.
 *
 * @property {Object} topologyId A unique identifier for the topology
 * @property {ServerAddress} address The address (host/port pair) of the server
 * @property {ServerDescription} previousDescription The previous server description
 * @property {ServerDescription} newDescription The new server description
 */
class ServerDescriptionChangedEvent {
  constructor(topologyId, address, previousDescription, newDescription) {
    Object.assign(this, { topologyId, address, previousDescription, newDescription });
  }
}

/**
 * Published when server is initialized.
 *
 * @property {Object} topologyId A unique identifier for the topology
 * @property {ServerAddress} address The address (host/port pair) of the server
 */
class ServerOpeningEvent {
  constructor(topologyId, address) {
    Object.assign(this, { topologyId, address });
  }
}

/**
 * Published when server is closed.
 *
 * @property {ServerAddress} address The address (host/port pair) of the server
 * @property {Object} topologyId A unique identifier for the topology
 */
class ServerClosedEvent {
  constructor(topologyId, address) {
    Object.assign(this, { topologyId, address });
  }
}

/**
 * Published when topology description changes.
 *
 * @property {Object} topologyId
 * @property {TopologyDescription} previousDescription The old topology description
 * @property {TopologyDescription} newDescription The new topology description
 */
class TopologyDescriptionChangedEvent {
  constructor(topologyId, previousDescription, newDescription) {
    Object.assign(this, { topologyId, previousDescription, newDescription });
  }
}

/**
 * Published when topology is initialized.
 *
 * @param {Object} topologyId A unique identifier for the topology
 */
class TopologyOpeningEvent {
  constructor(topologyId) {
    Object.assign(this, { topologyId });
  }
}

/**
 * Published when topology is closed.
 *
 * @param {Object} topologyId A unique identifier for the topology
 */
class TopologyClosedEvent {
  constructor(topologyId) {
    Object.assign(this, { topologyId });
  }
}

/**
 * Fired when the server monitor’s ismaster command is started - immediately before
 * the ismaster command is serialized into raw BSON and written to the socket.
 *
 * @property {Object} connectionId The connection id for the command
 */
class ServerHeartbeatStartedEvent {
  constructor(connectionId) {
    Object.assign(this, { connectionId });
  }
}

/**
 * Fired when the server monitor’s ismaster succeeds.
 *
 * @param {Number} duration The execution time of the event in ms
 * @param {Object} reply The command reply
 * @param {Object} connectionId The connection id for the command
 */
class ServerHeartbeatSucceededEvent {
  constructor(duration, reply, connectionId) {
    Object.assign(this, { duration, reply, connectionId });
  }
}

/**
 * Fired when the server monitor’s ismaster fails, either with an “ok: 0” or a socket exception.
 *
 * @param {Number} duration The execution time of the event in ms
 * @param {MongoError|Object} failure The command failure
 * @param {Object} connectionId The connection id for the command
 */
class ServerHeartbeatFailedEvent {
  constructor(duration, failure, connectionId) {
    Object.assign(this, { duration, failure, connectionId });
  }
}

/**
 * Performs a server check as described by the SDAM spec.
 *
 * NOTE: This method automatically reschedules itself, so that there is always an active
 * monitoring process
 *
 * @param {Server} server The server to monitor
 */
function monitorServer(server) {
  // executes a single check of a server
  const checkServer = callback => {
    let start = process.hrtime();

    // emit a signal indicating we have started the heartbeat
    server.emit('serverHeartbeatStarted', new ServerHeartbeatStartedEvent(server.name));

    server.command(
      'admin.$cmd',
      { ismaster: true },
      {
        monitoring: true,
        socketTimeout: server.s.options.connectionTimeout || 2000
      },
      function(err, result) {
        let duration = calculateDurationInMs(start);

        if (err) {
          server.emit(
            'serverHeartbeatFailed',
            new ServerHeartbeatFailedEvent(duration, err, server.name)
          );

          return callback(err, null);
        }

        const isMaster = result.result;
        server.emit(
          'serverHeartbeatSucceded',
          new ServerHeartbeatSucceededEvent(duration, isMaster, server.name)
        );

        return callback(null, isMaster);
      }
    );
  };

  const successHandler = isMaster => {
    server.s.monitoring = false;

    // emit an event indicating that our description has changed
    server.emit('descriptionReceived', new ServerDescription(server.description.address, isMaster));

    // schedule the next monitoring process
    server.s.monitorId = setTimeout(
      () => monitorServer(server),
      server.s.options.heartbeatFrequencyMS
    );
  };

  // run the actual monitoring loop
  server.s.monitoring = true;
  checkServer((err, isMaster) => {
    if (err) {
      // According to the SDAM specification's "Network error during server check" section, if
      // an ismaster call fails we reset the server's pool. If a server was once connected,
      // change its type to `Unknown` only after retrying once.

      // TODO: we need to reset the pool here

      return checkServer((err, isMaster) => {
        if (err) {
          server.s.monitoring = false;

          // we revert to an `Unknown` by emitting a default description with no isMaster
          server.emit('descriptionReceived', new ServerDescription(server.description.address));

          // we do not reschedule monitoring in this case
          return;
        }

        successHandler(isMaster);
      });
    }

    successHandler(isMaster);
  });
}

module.exports = {
  ServerDescriptionChangedEvent,
  ServerOpeningEvent,
  ServerClosedEvent,
  TopologyDescriptionChangedEvent,
  TopologyOpeningEvent,
  TopologyClosedEvent,
  ServerHeartbeatStartedEvent,
  ServerHeartbeatSucceededEvent,
  ServerHeartbeatFailedEvent,
  monitorServer
};
