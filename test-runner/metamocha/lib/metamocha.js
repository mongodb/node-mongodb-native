var Mocha = require('mocha'),
    Context = require('mocha').Context,
    utils = require('mocha').utils;

/**
 * MetaMocha Test Runner
 */
var MetaMocha = function(opts) {
  require('./metadata_ui');

  var mochaOpts = opts || {};
  if (!mochaOpts.ui) {
    mochaOpts.ui = 'metadata_ui';
  } else {
    console.warn('Warning: Metadata in tests depends on the metadataUi or extensions of that UI');
  }

  this.mocha = new Mocha(mochaOpts);
  this.files = [];
  this.filters = [];
};

MetaMocha.prototype.lookupFiles = function(path, extensions, recursive) {
  extensions = extensions || ['js'];
  recursive = recursive || true;

  var foundFiles = utils.lookupFiles(path, extensions, recursive);
  this.files = this.files.concat(foundFiles);
};

/**
 * Load files and generate Test objects
 */
MetaMocha.prototype.loadFiles = function() {
  var self = this;

  this.files.forEach(function(file) {
    self.mocha.addFile(file);
  });
  this.mocha.loadFiles();
  if (this.filters.length) {
    this.applyFilters();
  }
  return this;
};

/**
 * Add filter to the list of filters
 */
MetaMocha.prototype.addFilter = function(filter) {
  if (typeof filter !== 'function' && typeof filter !== 'object') {
    throw new Error('Type of filter must either be a function or an object');
  }
  if (typeof filter === 'object' && (!filter.filter || typeof filter.filter !== 'function')) {
    throw new Error('Object filters must have a function named filter');
  }

  if (typeof filter === 'function') {
    this.filters.push({filter: filter});
  } else {
    this.filters.push(filter);
  }
  return this;
};

/**
 * Apply the filters in the list to the tests
 */
MetaMocha.prototype.applyFilters = function() {
  var self = this;
  var rootSuite = this.mocha.suite;

  function filterSuiteTests(suite) {
    if (suite.tests.length) {
      suite.tests = suite.tests.filter(function(test) {
        return self.filters.every(function(filterObj) {
          return filterObj.filter(test);
        });
      });
    }

    if (suite.suites.length) {
      for (var i = 0; i < suite.suites.length; ++i) filterSuiteTests(suite.suites[i]);
    }
  }

  filterSuiteTests(rootSuite);
  return this;
};

/**
 * Run the tests
 */
MetaMocha.prototype.run = function(configuration, done) {
  // Monkey patch to allow for configuration to be added with the context
  Context.prototype.runnable = function(runnable) {
    if (!arguments.length) {
      return this._runnable;
    }

    if (runnable && runnable.metadata) {
      this.metadata = runnable.metadata;
    }

    this.test = this._runnable = runnable;
    this.configuration = configuration;
    return this;
  };

  var self = this;
  var called = 0;
  function callback() {
    called += 1;
    if (called === self.filters.length) _run();
  }

  if (self.filters.length) {
    self.filters.forEach(function(filter) {
      if (typeof filter.beforeStart === 'function') {
        filter.beforeStart(configuration, callback);
      } else {
        callback();
      }
    });
  }

  function _run() {
    if (self.files.length) {
      self.loadFiles();
    }

    self.mocha.run(done);
  }
};

module.exports = MetaMocha;
