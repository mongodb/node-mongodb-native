var utils = require('../../lib/mongodb/utils')
var shared = require('./contexts')

exports['isArray handles same context'] = function(configuration, test) {
  test.ok(utils.isArray([]));
  test.ok(utils.isArray(new Array(3)));
  test.done();
}

exports['isArray handles other contexts'] = function(configuration, test) {
  test.ok(utils.isArray(shared.array));
  test.done();
}

exports['isObject handles same context'] = function(configuration, test) {
  test.ok(utils.isObject({}));
  test.ok(utils.isObject(new Object));
  test.done();
}

exports['isObject handles other contexts'] = function(configuration, test) {
  test.ok(utils.isObject(shared.object));
  test.done();
}

exports['isDate handles same context'] = function(configuration, test) {
  test.ok(utils.isDate(new Date));
  test.done();
}

exports['isDate handles other contexts'] = function(configuration, test) {
  test.ok(utils.isDate(shared.date));
  test.done();
}

exports['toError is a function'] = function(configuration, test) {
  test.equal('function', typeof utils.toError);
  test.done();
}

exports['toError converts strings to Error'] = function(configuration, test) {
  var s = 'test';
  var e = utils.toError(s);
  test.ok(e instanceof Error);
  test.equal(s, e.message);
  test.done();
}

exports['toError Errors have a MongoError name'] = function(configuration, test) {
  var e = utils.toError('test');
  test.equal('MongoError', e.name);
  test.done();
}

exports['toError utilizes `err` property for message if exists'] = function(configuration, test) {
  var o = { err: 'test' };
  var e = utils.toError(o);
  test.ok(e instanceof Error);
  test.equal('test', e.message);
  test.done();
}

exports['toError utilizes `errmsg` property for message if it exists and `err` property does not exist'] = function(configuration, test) {
  var o = { errmsg: 'test' };
  var e = utils.toError(o);
  test.ok(e instanceof Error);
  test.equal('test', e.message);

  o.err = 'changed';
  var e = utils.toError(o);
  test.ok(e instanceof Error);
  test.equal('changed', e.message);

  test.done();
}

exports['toError keeps properties of arg object'] = function(configuration, test) {
  var o = { err: 'test', x: 1, something: 'else' };
  var e = utils.toError(o);
  test.ok(e instanceof Error);
  test.equal('test', e.message);
  test.equal(1, e.x);
  test.equal('else', e.something);
  test.done();
}

exports['toError returns the arg if it is instanceof Error'] = function(configuration, test) {
  var o = new Error('test');
  var e = utils.toError(o);
  test.equal(o, e);
  test.done();
}