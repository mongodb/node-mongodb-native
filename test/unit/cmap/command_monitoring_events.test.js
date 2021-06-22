'use strict';

const { Msg, Query, GetMore, KillCursor } = require('../../../src/cmap/commands');
const { CommandStartedEvent } = require('../../../src/cmap/command_monitoring_events');
const { expect } = require('chai');
const { Long } = require('bson');

describe('Command Monitoring Events - unit/cmap', function () {
  const commands = [
    new Query('admin.$cmd', { a: { b: 10 }, $query: { b: 10 } }, {}),
    new Query('hello', { a: { b: 10 }, $query: { b: 10 } }, {}),
    new Msg('admin.$cmd', { b: { c: 20 } }, {}),
    new Msg('hello', { b: { c: 20 } }, {}),
    new GetMore('admin.$cmd', Long.fromNumber(10)),
    new GetMore('hello', Long.fromNumber(10)),
    new KillCursor('admin.$cmd', [Long.fromNumber(100), Long.fromNumber(200)]),
    new KillCursor('hello', [Long.fromNumber(100), Long.fromNumber(200)]),
    { ns: 'admin.$cmd', query: { $query: { a: 16 } } },
    { ns: 'hello there', f1: { h: { a: 52, b: { c: 10, d: [1, 2, 3, 5] } } } }
  ];

  for (const command of commands) {
    it(`should make a deep copy of object of type: ${command.constructor.name}`, () => {
      const ev = new CommandStartedEvent({ id: 'someId', address: 'someHost' }, command);
      if (command instanceof Query) {
        if (command.ns === 'admin.$cmd') {
          expect(ev.command !== command.query.$query).to.equal(true);
          for (const k in command.query.$query) {
            expect(ev.command[k]).to.deep.equal(command.query.$query[k]);
          }
        } else {
          expect(ev.command.filter !== command.query.$query).to.equal(true);
          for (const k in command.query.$query) {
            expect(ev.command.filter[k]).to.deep.equal(command.query.$query[k]);
          }
        }
      } else if (command instanceof Msg) {
        expect(ev.command !== command.command).to.equal(true);
        expect(ev.command).to.deep.equal(command.command);
      } else if (command instanceof GetMore) {
        // NOTE: BSON Longs pass strict equality when their internal values are equal
        // i.e.
        // let l1 = Long(10);
        // let l2 = Long(10);
        // l1 === l2 // returns true
        // expect(ev.command.getMore !== command.cursorId).to.equal(true);
        expect(ev.command.getMore).to.deep.equal(command.cursorId);

        ev.command.getMore = Long.fromNumber(50128);
        expect(command.cursorId).to.not.deep.equal(ev.command.getMore);
      } else if (command instanceof KillCursor) {
        expect(ev.command.cursors !== command.cursorIds).to.equal(true);
        expect(ev.command.cursors).to.deep.equal(command.cursorIds);
      } else if (typeof command === 'object') {
        if (command.ns === 'admin.$cmd') {
          expect(ev.command !== command.query.$query).to.equal(true);
          for (const k in command.query.$query) {
            expect(ev.command[k]).to.deep.equal(command.query.$query[k]);
          }
        }
      }
    });
  }
});
