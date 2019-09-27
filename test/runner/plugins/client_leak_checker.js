'use strict';

const TestConfiguration = require('../config');
const wtfnode = require('wtfnode');
const chalk = require('chalk');

let activeClients = [];
const $newClient = TestConfiguration.prototype.newClient;
TestConfiguration.prototype.newClient = function() {
  const client = $newClient.apply(this, arguments);
  activeClients.push(client);
  return client;
};

afterEach(() => {
  const openClientCount = activeClients.reduce(
    (count, client) => (client.isConnected() ? count + 1 : count),
    0
  );

  if (openClientCount > 0) {
    console.log(chalk.red('WARNING:') + ` ${openClientCount} client(s) left open after test`);
  }

  activeClients = [];
});

after(() => wtfnode.dump());

require('leaked-handles').set({
  fullStack: true, // use full stack traces
  timeout: 30000, // run every 30 seconds instead of 5.
  debugSockets: true // pretty print tcp thrown exceptions.
});
