'use strict';

const ClientSession = require('mongodb-core').Sessions.ClientSession;
const ReadPreference = require('mongodb-core').ReadPreference;
const assertions = require('./assertions');

const w = assertions.is('number', 'string');
const session = assertions.is(ClientSession);
const readPreference = assertions.is(ReadPreference, 'string');

module.exports = { w, session, readPreference };
