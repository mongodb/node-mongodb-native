'use strict';

var mockupdb = require('../'),
  co = require('co'),
  assert = require('assert');

// Simple ismaster exhange
co(function*() {
  // Create a server
  var primary = yield mockupdb.createServer(31000, 'localhost');
  var firstSecondary = yield mockupdb.createServer(31001, 'localhost');
  var secondSecondary = yield mockupdb.createServer(31002, 'localhost');

  // primary server interactions
  co(function*() {
    // Wait for the request
    var request = yield primary.receive();
    // Assert we received an op_query message
    assert.equal('op_query', request.type);
    // Assert we received the ismaster
    assert.deepEqual({ ismaster: true }, request.document);
    // Return the ismaster result
    request.reply({ ok: 1 });
  });

  // first secondary server interactions
  co(function*() {
    // Wait for the request
    var request = yield firstSecondary.receive();
    // Assert we received an op_query message
    assert.equal('op_query', request.type);
    // Assert we received the ismaster
    assert.deepEqual({ ismaster: true }, request.document);
    // Return the ismaster result
    request.reply({ ok: 1 });
  });

  // second secondary server interactions
  co(function*() {
    // Wait for the request
    var request = yield secondSecondary.receive();
    // Assert we received an op_query message
    assert.equal('op_query', request.type);
    // Assert we received the ismaster
    assert.deepEqual({ ismaster: true }, request.document);
    // Return the ismaster result
    request.reply({ ok: 1 });
  });
});
