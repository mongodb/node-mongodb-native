'use strict';
const {
  CommandStartedEvent,
  CommandSucceededEvent,
  CommandFailedEvent
} = require('../../../src/cmap/events');
const { Msg } = require('../../../src/cmap/commands');
const { Connection } = require('../../../src/cmap/connection');
const { expect } = require('chai');
const sinon = require('sinon');

describe('events', function () {
  const command = new Msg('db.coll', { find: 'coll', filter: {} }, {});
  const connection = sinon.createStubInstance(Connection);

  describe('CommandStartedEvent', function () {
    const event = new CommandStartedEvent(connection, command);

    it('must allow serverId to be nullable', function () {
      expect(event.serverId).to.be.undefined;
    });
  });

  describe('CommandSucceededEvent', function () {
    const event = new CommandSucceededEvent(connection, command, {}, 0);

    it('must allow serverId to be nullable', function () {
      expect(event.serverId).to.be.undefined;
    });
  });

  describe('CommandFailedEvent', function () {
    const event = new CommandFailedEvent(connection, command, {}, 0);

    it('must allow serverId to be nullable', function () {
      expect(event.serverId).to.be.undefined;
    });
  });
});
