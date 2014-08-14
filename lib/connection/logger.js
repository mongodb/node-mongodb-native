var f = require('util').format;

// Filters for classes
var classFilters = {};
var filteredClasses = {};
var level = null;
// Save the process id
var pid = process.pid;
// current logger
var currentLogger = null;

// Actual logger class
var Logger = function(className, options) {
  options = options || {};

  // Current logger
  if(currentLogger == null && options.logger) {
    currentLogger = options.logger;
  } else if(currentLogger == null) {
    currentLogger = console.log;
  }

  // Set level of logging, default is error
  if(level == null) {
    level = options.loggerLevel || 'error';
  }

  // Add all class names
  if(filteredClasses[className] == null) classFilters[className] =  true;

  // Return the object with methods
  return {
    debug: function(message, object) {
      if(this.isDebug() && (classFilters[className] && Object.keys(filteredClasses).length > 0)) return;
      var dateTime = new Date().getTime();
      var msg = f("[%s-%s:%s] %s %s", 'DEBUG', className, pid, dateTime, message);
      currentLogger(msg, {
          type: 'debug', message: message, className: className, pid: pid, date: dateTime
      });
    },

    info: function(message, object) {
      if(this.isInfo() && (classFilters[className] && Object.keys(filteredClasses).length > 0)) return;
      var dateTime = new Date().getTime();
      var msg = f("[%s-%s:%s] %s %s", 'INFO', className, pid, dateTime, message);
      currentLogger(msg, {
          type: 'info', message: message, className: className, pid: pid, date: dateTime
      });
    },

    error: function(message, object) {
      if(this.isError()  && (classFilters[className] && Object.keys(filteredClasses).length > 0)) return;
      var dateTime = new Date().getTime();
      var msg = f("[%s-%s:%s] %s %s", 'ERROR', className, pid, dateTime, message);
      currentLogger(msg, {
          type: 'error', message: message, className: className, pid: pid, date: dateTime
      });
    },

    isInfo: function() {
      return level == 'info' || level == 'debug';
    },

    isError: function() {
      return level == 'error' || level == 'info' || level == 'debug';
    },

    isDebug: function() {
      return level == 'debug';
    }
  }
}

Logger.currentLogger = function() {
  return currentLogger;
}

Logger.setCurrentLogger = function(logger) {
  currentLogger = logger;
}

Logger.filter = function(type, values) {
  if(type == 'class' && Array.isArray(values)) {
    filteredClasses = {};

    values.forEach(function(x) {
      filteredClasses[x] = true;
    });
  }
}

Logger.setLevel = function(_level) {
  if(_level != 'info' && _level != 'error' && _level != 'debug') throw new Error(f("%s is an illegal logging level", _level));
  level = _level;
}

module.exports = Logger;