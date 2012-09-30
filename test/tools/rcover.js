#!/usr/bin/env node
var fs = require('fs'),
    path = require('path'),
    nodeunit = require('nodeunit'),
    jade = require('jade');

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
  this.dataDirectory = __dirname + "/../../rcover_html"; 
  this.results = {};
}

RCover.prototype.load = function load(files) { 
  this.files = files;
  this.finalFiles = [];
  this.totalNumberOfFiles = 0;

  // For each entry load the file and extract all the test methods available
  for(var i = 0; i < this.files.length; i++) {
    var file = this.files[i];
    // Stat the object
    var stat = fs.statSync(__dirname + "/../../" + file);
    if(stat.isFile()) {
      this.finalFiles.push({file: file, path: __dirname + "/../../" + file});
    }
  }

  // Total number of files that need to be processed
  this.totalNumberOfFiles = this.finalFiles.length;
  // Only run tests verified as files
  for(var i = 0; i < this.finalFiles.length; i++) {
    this.run(this.finalFiles[i]);
    // this.run(this.finalFile[i]);
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
      // console.log("================================================= testDone :: " + name)
      // console.dir(Object.keys(_$jscoverage))
      // console.dir(_$jscoverage)
      // Get all the coverage files
      var keys = Object.keys(_$jscoverage);
      // Iterate over all the files
      for(var i = 0; i < keys.length; i++) {
        var file = keys[i];
        // console.log("-------------------------------------------- 0")
        // console.dir(Object.keys(_$jscoverage))
        // console.dir(_$jscoverage[file])
        if(!self.results[file]) self.results[file] = [];
        // console.log("-------------------------------------------- 1")
        // Get all the sources for the result
        var source = _$jscoverage[file].source;
        // console.log("-------------------------------------------- 2")
        // Iterate over all the coverage
        for(var j = 0; j < _$jscoverage[file].length; j++) {
          if(_$jscoverage[file][j] >= 1) {
            // console.log("================================= file :: " + testfile.file)
            // No existing record
            if(!self.results[file][j]) {
              self.results[file][j] = {source: source[j], files:[{file: testfile.file, test:name}]}
            } else {
              self.results[file][j].files.push({file:testfile, test:name});
            }
          } else if(isNaN(parseInt(_$jscoverage[file][j], 10))) {
            if(!self.results[file][j]) {
              self.results[file][j] = {source: source[j], files:[]};
            }
          }
        }
      }

      // console.dir(_$jscoverage['mongodb/connection/connection.js']  )

      // Clear out the js coverage variable state recorded by the last test
      // Ensuring we calculate pr test coverage
      for(var i = 0; i < keys.length; i++) {
        // for(var j = 0; j < _$jscoverage[keys[i]].length; j++) {
        //   if(!isNaN(parseInt(_$jscoverage[keys[i]][j]), 10)) {
        //     _$jscoverage[keys[i]][j] = 0;
        //   }
        // }
        var newEmptyStateArray = new Array(_$jscoverage[keys[i]].length);
        newEmptyStateArray.source = _$jscoverage[keys[i]].source;
        _$jscoverage[keys[i]] = newEmptyStateArray;
      }
    },
    done: function (assertions) {

      self.totalNumberOfFiles = self.totalNumberOfFiles - 1;
      // Perform reporting
      if(self.totalNumberOfFiles == 0) {
        self.report();
      }
    }
  };
  // Run the file with options
  nodeunit.runFiles([testfile.path], opts);
}

RCover.prototype.report = function() {
  // console.log("-------------------------------------------------------- 9")
  // console.dir(self.results['mongodb/collection.js'])
  var self = this;
  // console.dir(self.results['mongodb/connection/connection.js'])
  // Just generate a html report for now
  // Create the output directory
  if(!fs.existsSync(self.dataDirectory)) {
    // Create directory
    fs.mkdirSync(self.dataDirectory, "0755");
  }

  // For each result file render a html file
  var keys = Object.keys(self.results);
  for(var i = 0; i < keys.length; i++) {
    var key = keys[i].replace(/\/|\./g, '_');
    // console.dir(self.results[keys[i]])
    // Render the template
    jade.renderFile(__dirname + "/templates/file_results.jade", 
      { pretty: true, 
        debug: false, 
        compileDebug: false,
        results: self.results[keys[i]]
      }, function(err, str){
      if (err) throw err;
      fs.writeFileSync(self.dataDirectory + "/" + key + ".html", str, 'ascii');
    });
  }
}

// Create instance and load specific file
new RCover().load([
  // "test/insert_test.js",
  // "test/find_test.js",
  "test/connection/message_parser_test.js",
  // "test/connection/message_parser_2_test.js"
  ]);