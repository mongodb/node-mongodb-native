'use strict';

function closeOperation(client, force, callback) {
  const completeClose = err => {
    client.emit('close', client);
    for (const name in client.s.dbCache) {
      client.s.dbCache[name].emit('close', client);
    }

    client.removeAllListeners('close');
    callback(err, null);
  };

  if (client.topology == null) {
    completeClose();
    return;
  }

  client.topology.close(force, completeClose);
}

module.exports = { closeOperation };
