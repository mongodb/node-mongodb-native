var f = require('util').format;

var Logger = function(className, options) {
  options = options || {};
  // Get the options
  var logger = options.logger || console.log;
  var level = options.loggerLevel || 'info';
  var pid = process.pid;

  // Return the object with methods
  return {
    debug: function(message, object) {
      if(level != 'debug') return;
      logger(f("[%s-%s:%s] %s %s", 'DEBUG', className, pid, new Date().getTime(), message));
    },

    info: function(message, object) {
      if(level != 'info') return;
      logger(f("[%s-%s:%s] %s %s", 'INFO', className, pid, new Date().getTime(), message));
    },

    error: function(message, object) {
      if(level != 'error') return;
      logger(f("[%s-%s:%s] %s %s", 'ERROR', className, pid, new Date().getTime(), message));
    },

    isInfo: function() {
      return level == 'info';
    },

    isError: function() {
      return level == 'error';
    },

    isDebug: function() {
      return level == 'debug';
    }
  }
}

module.exports = Logger;