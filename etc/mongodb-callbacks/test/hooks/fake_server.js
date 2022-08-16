'use strict';

const sinon = require('sinon');
const chai = require('chai');
chai.use(require('sinon-chai'));

const { Server } = require('mongodb/lib/sdam/server');

const setupFakeServerCommandHandler = function setupFakeServerCommandHandler() {
  sinon.stub(Server.prototype, 'command').yieldsRight();
};

const resetFakeServerCommandHandler = function resetFakeServerCommandHandler() {
  sinon.restore();
};

const beforeEach = [setupFakeServerCommandHandler];
const afterEach = [resetFakeServerCommandHandler];
module.exports = { mochaHooks: { beforeEach, afterEach } };
