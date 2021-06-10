'use strict';

const mock = require('../../tools/mock');
const { connect } = require('../../../src/cmap/connect');
const { Connection } = require('../../../src/cmap/connection');
const { Msg, Query, GetMore, KillCursor } = require('../../../src/cmap/commands');
const { CommandStartedEvent } = require('../../../src/cmap/command_monitoring_events');
const { expect } = require('chai');
const { Long } = require('bson');

describe('Command Monitoring Events - unit/cmap', function () {
  let server;
  after(() => mock.cleanup());
  before(() => mock.createServer().then(s => (server = s)));

  it('should never hold references to commands passed into CommandStartedEvent objects', function (done) {
    const commands = [
      new Query('admin.$cmd', { a: { b: 10 }, $query: { b: 10 } }, {}),
      new Query('hello', { a: { b: 10 }, $query: { b: 10 } }, {}),
      new Msg('admin.$cmd', { b: { c: 20 } }, {}),
      new Msg('hello', { b: { c: 20 } }, {}),
      new GetMore('admin.$cmd', Long.fromNumber(10)),
      new GetMore('hello', Long.fromNumber(10)),
      new KillCursor('admin.$cmd', [Long.fromNumber(100), Long.fromNumber(200)]),
      new KillCursor('hello', [Long.fromNumber(100), Long.fromNumber(200)])
    ];

    server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster || doc.hello) {
        request.reply(mock.DEFAULT_ISMASTER_36);
      }

      // blackhole all other requests
    });

    connect({ connectionType: Connection, hostAddress: server.hostAddress() }, (err, conn) => {
      expect(err).to.be.undefined;
      expect(conn).to.not.be.undefined;

      commands.forEach(c => {
        const ev = new CommandStartedEvent(conn, c);
        if (c instanceof Query) {
          if (c.ns === 'admin.$cmd') {
            expect(ev.command !== c.query.$query).to.equal(true);
            for (const k in c.query.$query) {
              expect(ev.command[k]).to.deep.equal(c.query.$query[k]);
            }
          } else {
            expect(ev.command.filter !== c.query.$query).to.equal(true);
            for (const k in c.query.$query) {
              expect(ev.command.filter[k]).to.deep.equal(c.query.$query[k]);
            }
          }
        } else if (c instanceof Msg) {
          expect(ev.command !== c.command).to.equal(true);
          expect(ev.command).to.deep.equal(c.command);
        } else if (c instanceof GetMore) {
          // NOTE: BSON Longs pass strict equality when their internal values are equal
          // i.e.
          // let l1 = Long(10);
          // let l2 = Long(10);
          // l1 === l2 // returns true
          // expect(ev.command.getMore !== c.cursorId).to.equal(true);
          expect(ev.command.getMore).to.deep.equal(c.cursorId);

          ev.command.getMore = Long.fromNumber(50128);
          expect(c.cursorId).to.not.deep.equal(ev.command.getMore);
        } else if (c instanceof KillCursor) {
          expect(ev.command.cursors !== c.cursorIds).to.equal(true);
          expect(ev.command.cursors).to.deep.equal(c.cursorIds);
        }
      });

      done();
    });
  });
});
