'use strict';

const ServerDescription = require('./server_description').ServerDescription;
const calculateDurationInMs = require('../utils').calculateDurationInMs;

const sdamEvents = require('./events');
const ServerHeartbeatStartedEvent = sdamEvents.ServerHeartbeatStartedEvent;
const ServerHeartbeatSucceededEvent = sdamEvents.ServerHeartbeatSucceededEvent;
const ServerHeartbeatFailedEvent = sdamEvents.ServerHeartbeatFailedEvent;

// pulled from `Server` implementation
const STATE_CLOSED = 'closed';
const STATE_CLOSING = 'closing';

/**
 * Performs a server check as described by the SDAM spec.
 *
 * NOTE: This method automatically reschedules itself, so that there is always an active
 * monitoring process
 *
 * @param {Server} server The server to monitor
 */
function monitorServer(server, options) {
  options = options || {};
  const heartbeatFrequencyMS = options.heartbeatFrequencyMS || 10000;

  if (options.initial === true) {
    server.s.monitorId = setTimeout(() => monitorServer(server), heartbeatFrequencyMS);
    return;
  }

  const rescheduleMonitoring = () => {
    server.s.monitoring = false;
    server.s.monitorId = setTimeout(() => {
      server.s.monitorId = undefined;
      server.monitor();
    }, heartbeatFrequencyMS);
  };

  // executes a single check of a server
  const checkServer = callback => {
    let start = process.hrtime();

    // emit a signal indicating we have started the heartbeat
    server.emit('serverHeartbeatStarted', new ServerHeartbeatStartedEvent(server.name));

    // NOTE: legacy monitoring event
    process.nextTick(() => server.emit('monitoring', server));

    server.command(
      'admin.$cmd',
      { ismaster: true },
      {
        monitoring: true,
        socketTimeout: server.s.options.connectionTimeout || 2000
      },
      (err, result) => {
        let duration = calculateDurationInMs(start);

        if (err) {
          server.emit(
            'serverHeartbeatFailed',
            new ServerHeartbeatFailedEvent(duration, err, server.name)
          );

          return callback(err, null);
        }

        // save round trip time
        server.description.roundTripTime = duration;

        const isMaster = result.result;
        server.emit(
          'serverHeartbeatSucceeded',
          new ServerHeartbeatSucceededEvent(duration, isMaster, server.name)
        );

        return callback(null, isMaster);
      }
    );
  };

  const successHandler = isMaster => {
    // emit an event indicating that our description has changed
    server.emit('descriptionReceived', new ServerDescription(server.description.address, isMaster));
    if (server.s.state === STATE_CLOSED || server.s.state === STATE_CLOSING) {
      return;
    }

    rescheduleMonitoring();
  };

  // run the actual monitoring loop
  server.s.monitoring = true;
  checkServer((err, isMaster) => {
    if (!err) {
      successHandler(isMaster);
      return;
    }

    // According to the SDAM specification's "Network error during server check" section, if
    // an ismaster call fails we reset the server's pool. If a server was once connected,
    // change its type to `Unknown` only after retrying once.
    server.s.pool.reset(() => {
      // otherwise re-attempt monitoring once
      checkServer((error, isMaster) => {
        if (error) {
          // we revert to an `Unknown` by emitting a default description with no isMaster
          server.emit(
            'descriptionReceived',
            new ServerDescription(server.description.address, null, { error })
          );

          rescheduleMonitoring();
          return;
        }

        successHandler(isMaster);
      });
    });
  });
}

module.exports = {
  monitorServer
};
