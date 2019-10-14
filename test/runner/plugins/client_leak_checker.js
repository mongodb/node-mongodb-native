'use strict';

const TestConfiguration = require('../config');
const wtfnode = require('wtfnode');
const chalk = require('chalk');

let activeClients = [];
const $newClient = TestConfiguration.prototype.newClient;
TestConfiguration.prototype.newClient = function() {
  const client = $newClient.apply(this, arguments);
  client.trace = new Error().stack;
  activeClients.push(client);
  const closeHandler = () => {
    activeClients = activeClients.filter(c => c !== client);
    client.removeListener('close', closeHandler);
  };

  client.on('close', closeHandler);
  return client;
};

function unifiedTopologyIsConnected(client) {
  const topology = client.topology;
  if (topology == null) {
    return false;
  }

  return Array.from(topology.s.servers).some(
    server => server.s && server.s.pool && server.s.pool.isConnected()
  );
}

after(function() {
  wtfnode.dump();

  const isUnifiedTopology = this.configuration.usingUnifiedTopology;
  const traces = [];
  const openClientCount = activeClients.reduce((count, client) => {
    const isConnected = isUnifiedTopology
      ? unifiedTopologyIsConnected(client)
      : client.isConnected();

    if (isConnected) {
      traces.push(client.trace);
      return count + 1;
    }

    return count;
  }, 0);

  if (openClientCount > 0) {
    console.log(chalk.red('WARNING:') + ` ${openClientCount} client(s) left open after test`);
    traces.forEach(trace => console.log(trace));
  }

  activeClients = [];
});
