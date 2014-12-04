"use strict";

var OSFilter = function() {
  // Get environmental variables that are known
  var platform = process.platform;

  this.filter = function(test) {
    if(test.metadata == null) return false;
    if(test.metadata.requires == null) return false;
    if(test.metadata.requires.os == null) return false;
    // Get the os
    var os = test.metadata.requires.os;

    // console.log("----------------------------------------------------------")
    // console.log(test.metadata.requires.os)
    // console.log(platform)
    // console.log(os[0] == '!')
    // console.log(os != ("!" + platform))

    if(os == platform) return false
    // If !platform only allow running if the platform match
    if(os[0] == '!' && os != ("!" + platform)) return false;
    // console.log("---------------------------------------------------------- 1")
    // console.log("---------------------------------------------------------- 2")
    return true;
  }
}

module.exports = OSFilter;
