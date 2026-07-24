'use strict';

const {
  OpQueryRequest,
  OpMsgRequest,
  CommandStartedEvent,
  DocumentSequence
} = require('../../mongodb');
const { expect } = require('chai');

describe('Command Monitoring Events - unit/cmap', function () {
  const commands = [
    new OpQueryRequest('admin', { a: { b: 10 }, $query: { b: 10 } }, {}),
    new OpQueryRequest('hello', { a: { b: 10 }, $query: { b: 10 } }, {}),
    new OpMsgRequest('admin', { b: { c: 20 } }, {}),
    new OpMsgRequest('hello', { b: { c: 20 } }, {}),
    { ns: 'admin.$cmd', query: { $query: { a: 16 } } },
    { ns: 'hello there', f1: { h: { a: 52, b: { c: 10, d: [1, 2, 3, 5] } } } }
  ];

  for (const command of commands) {
    it(`should make a deep copy of object of type: ${command.constructor.name}`, () => {
      const ev = new CommandStartedEvent({ id: 'someId', address: 'someHost' }, command);
      if (command instanceof OpQueryRequest) {
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
      } else if (command instanceof OpMsgRequest) {
        expect(ev.command !== command.command).to.equal(true);
        expect(ev.command).to.deep.equal(command.command);
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

  describe('CommandStartedEvent', function () {
    const conn = { id: '<some id>', address: '<some address>' };

    it('should wrap a basic query option', function () {
      const db = 'test1';
      const query = new OpQueryRequest(
        `${db}`,
        {
          testCmd: 1,
          fizz: 'buzz',
          star: 'trek'
        },
        {}
      );

      const startEvent = new CommandStartedEvent(conn, query);
      expect(startEvent).to.have.property('commandName', 'testCmd');
      expect(startEvent).to.have.property('databaseName', db);
      expect(startEvent).to.have.property('requestId', query.requestId);
      expect(startEvent).to.have.property('connectionId').that.is.a('string');
      expect(startEvent).to.have.property('command').that.deep.equals(query.query);
    });

    it('should upconvert a Query wrapping a command into the corresponding command', function () {
      const db = 'admin';
      const query = new OpQueryRequest(
        `${db}`,
        {
          $query: {
            testCmd: 1,
            fizz: 'buzz',
            star: 'trek',
            batchSize: 0,
            skip: 0
          }
        },
        {}
      );

      const startEvent = new CommandStartedEvent(conn, query);

      expect(startEvent).to.have.property('commandName', 'testCmd');
      expect(startEvent).to.have.property('databaseName', db);
      expect(startEvent).to.have.property('requestId', query.requestId);
      expect(startEvent).to.have.property('connectionId').that.is.a('string');
      expect(startEvent).to.have.property('command').that.deep.equals(query.query.$query);
    });
  });

  for (const { name, field, documents } of [
    { name: 'insert', field: 'documents', documents: [{ _id: 1 }, { _id: 2 }] },
    { name: 'update', field: 'updates', documents: [{ q: { _id: 1 }, u: { $set: { a: 1 } } }] },
    { name: 'delete', field: 'deletes', documents: [{ q: { _id: 1 }, limit: 1 }] }
  ]) {
    it(`reconstructs the ${field} document sequence into an array (${name} command)`, function () {
      const command = {
        [name]: 'coll',
        [field]: new DocumentSequence(field, documents),
        $db: 'test'
      };
      const msg = new OpMsgRequest('test', command, {});
      const event = new CommandStartedEvent({ id: 1, address: '127.0.0.1:27017' }, msg);
      expect(event.command[field]).to.be.an('array').that.deep.equals(documents);
    });
  }

  it('leaves non-document-sequence fields untouched', function () {
    const pipeline = [{ $match: { a: 1 } }];
    const command = { aggregate: 'coll', pipeline, cursor: {}, $db: 'test' };
    const msg = new OpMsgRequest('test', command, {});
    const event = new CommandStartedEvent({ id: 1, address: '127.0.0.1:27017' }, msg);
    expect(event.command.pipeline).to.be.an('array').that.deep.equals(pipeline);
    expect(event.command.cursor).to.deep.equal({});
  });
});
