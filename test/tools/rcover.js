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
  this.testrunner = nodeunit.reporters.minimal;
}

RCover.prototype.load = function load(files) { 
  this.files = files;

  // For each entry load the file and extract all the test methods available
  for(var i = 0; i < this.files.length; i++) {
    var file = this.files[i];

    // Stat the object
    var stat = fs.statSync(__dirname + "/../../" + file);
    if(stat.isFile()) {
      var requireObject = require(__dirname + "/../../" + file);
    }
    // console.dir(stat.isFile())
    // Attemp to require the file to check all the tests available
    // var requireObject = require(file);

  }
}

RCover.prototype.run = function run() {  
  
  // this.testrunner.run(files, options, function(err) {
  //     // console.dir(_$jscoverage)
  //     if (err) {
  //         process.exit(1);
  //     }
  // });
}

// Create instance and load specific file
var rcover = new RCover();
// Load the file
rcover.load(["/test/insert_test.js"]);