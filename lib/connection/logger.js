var f = require('util').format;

// Filters for classes
var classFilters = {};
var filteredClasses = {};
var level = null;
// Save the process id
var pid = process.pid;

// Actual logger class
var Logger = function(className, options) {
  options = options || {};
  
  // Get the options
  var logger = options.logger || console.log;
  
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
      logger(f("[%s-%s:%s] %s %s", 'DEBUG', className, pid, new Date().getTime(), message));
    },

    info: function(message, object) {
      if(this.isInfo() && (classFilters[className] && Object.keys(filteredClasses).length > 0)) return;
      logger(f("[%s-%s:%s] %s %s", 'INFO', className, pid, new Date().getTime(), message));
    },

    error: function(message, object) {
      if(this.isError()  && (classFilters[className] && Object.keys(filteredClasses).length > 0)) return;
      logger(f("[%s-%s:%s] %s %s", 'ERROR', className, pid, new Date().getTime(), message));
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