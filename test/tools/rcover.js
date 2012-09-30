#!/usr/bin/env node
var fs = require('fs'),
    path = require('path'),
    nodeunit = require('nodeunit');
// Default options for nodeunit
var options = {
    "error_prefix": "\u001B[31m",
    "error_suffix": "\u001B[39m",
    "ok_prefix": "\u001B[32m",
    "ok_suffix": "\u001B[39m",
    "bold_prefix": "\u001B[1m",
    "bold_suffix": "\u001B[22m",
    "assertion_prefix": "\u001B[35m",
    "assertion_suffix": "\u001B[39m"
}

var RCover = function RCover() {  
  this.testrunner = nodeunit.reporters.default;
  this.results = {};
}

RCover.prototype.load = function load(files) { 
  this.files = files;

  // For each entry load the file and extract all the test methods available
  // for(var i = 0; i < this.files.length; i++) {
  for(var i = 0; i < this.files.length; i++) {
    var file = this.files[i];

    // Stat the object
    var stat = fs.statSync(__dirname + "/../../" + file);
    if(stat.isFile()) {
      // Run the test we passed in
      this.run(__dirname + "/../../" + file);
    }
  }
}

RCover.prototype.run = function run(testfile, functionName) {  
  var self = this;

  var opts = {
    testspec: functionName,
    testFullSpec: null,
    moduleStart: function (name) {
      // console.log("------------------------------------------------ moduleStart")
    },
    moduleDone: function (name, assertions) {
      // console.log("------------------------------------------------ moduleDone")
    },
    testStart: function () {
      // console.log("------------------------------------------------ testStart")
    },
    testDone: function (name, assertions) {
      // Get all the coverage files
      var keys = Object.keys(_$jscoverage);
      // Iterate over all the files
      for(var i = 0; i < keys.length; i++) {
        var file = keys[i];

        if(!self.results[file]) self.results[file] = [];
        // Get all the sources for the result
        var source = _$jscoverage[file].source;
        // Iterate over all the coverage
        for(var j = 0; j < _$jscoverage[file].length; j++) {
          if(_$jscoverage[file][j] == 1) {

            // No existing record
            if(!self.results[file][j]) {
              self.results[file][j] = {source: source[j], files:[{file: testfile, test:functionName}]}
            } else {
              self.results[file][j].files.push({file:testfile, test:functionName});
            }
          } else if(_$jscoverage[file][j] != 1) {
            if(!self.results[file][j]) {
              self.results[file][j] = {source: source[j], files:[]};
            }
          }
        }
      }

      // Clear out the js coverage variable state recorded by the last test
      // Ensuring we calculate pr test coverage
      for(var i = 0; i < keys.length; i++) {
        var newEmptyStateArray = new Array(_$jscoverage[keys[i]].length);
        newEmptyStateArray.source = _$jscoverage[keys[i]].source;
        _$jscoverage[keys[i]] = newEmptyStateArray;
      }
    },
    done: function (assertions) {
    }
  };
  // console.log("-------------------------------------------------------- 9")
  // console.dir(self.results)

  // Run the file with options
  nodeunit.runFiles([testfile], opts);
}

// Create instance and load specific file
new RCover().load([
  "test/insert_test.js",
  "test/connection/message_parser_test.js"
  ]);