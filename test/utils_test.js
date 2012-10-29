
var utils = require('../lib/mongodb/utils')
var gleak = require('../dev/tools/gleak')
var shared = require('./contexts')

exports['isArray handles same context'] = function (test) {
  test.ok(utils.isArray([]));
  test.ok(utils.isArray(new Array(3)));
  test.done();
}

exports['isArray handles other contexts'] = function (test) {
  test.ok(utils.isArray(shared.array));
  test.done();
}

exports['isObject handles same context'] = function (test) {
  test.ok(utils.isObject({}));
  test.ok(utils.isObject(new Object));
  test.done();
}

exports['isObject handles other contexts'] = function (test) {
  test.ok(utils.isObject(shared.object));
  test.done();
}

exports['isDate handles same context'] = function (test) {
  test.ok(utils.isDate(new Date));
  test.done();
}

exports['isDate handles other contexts'] = function (test) {
  test.ok(utils.isDate(shared.date));
  test.done();
}

exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}
