var Server = require('./lib/server');

/*
 * Main module
 */
module.exports = {
  createServer: function(port, host, options) {
    options = options || {};
    return new Server(port, host, options).start();
  },
}
