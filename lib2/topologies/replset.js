"use strict"

var inherits = require('util').inherits,
  f = require('util').format,
  EventEmitter = require('events').EventEmitter,
  BSON = require('bson').native().BSON,
  ReadPreference = require('./read_preference'),
  Logger = require('../connection/logger'),
  debugOptions = require('../connection/utils').debugOptions,
  MongoError = require('../error'),
  Server = require('./server');

var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

var ReplSet = function(seedlist, options) {
  options = options || {};

  // Add event listener
  EventEmitter.call(this);

  this.s = {
  }

  this.state = DISCONNECTED;
}

inherits(ReplSet, EventEmitter);

module.exports = ReplSet;
