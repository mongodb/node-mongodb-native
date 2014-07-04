var vm = require('vm')
var fs = require('fs')
var path = require('path')

var shared = require('./shared');
var ind = fs.readFileSync(__dirname + '/other.js', 'utf8');
var filename = path.resolve(__dirname + '/other.js');
var script = vm.createScript(ind, filename);
script.runInNewContext({ require: require, __filename: filename });

module.exports = exports = shared;