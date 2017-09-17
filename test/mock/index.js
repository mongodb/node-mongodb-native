var Server = require('./lib/server');

const cleanup = (servers, spy, callback) => {
  if (typeof spy === 'function') {
    callback = spy;
    spy = undefined;
  }

  if (!Array.isArray(servers)) {
    throw new Error('First argument must be an array of mock servers');
  }

  if (spy) {
    const alreadyDrained = spy.connectionCount() === 0;
    const finish = () => {
      callback(null, null);
    };

    if (!alreadyDrained) {
      spy.once('drained', () => finish());
    }

    const cleanupPromise = Promise.all(servers.map(server => server.destroy())).catch(err =>
      callback(err, null)
    );

    if (alreadyDrained) {
      cleanupPromise.then(() => finish());
    }
  } else {
    Promise.all(servers.map(server => server.destroy()))
      .then(() => callback(null, null))
      .catch(err => callback(err, null));
  }
};

/*
 * Main module
 */
module.exports = {
  createServer: function(port, host, options) {
    options = options || {};
    return new Server(port, host, options).start();
  },

  cleanup: cleanup
};
