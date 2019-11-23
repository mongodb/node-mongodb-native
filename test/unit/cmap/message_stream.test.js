'use strict';
const BSON = require('bson');
const Readable = require('stream').Readable;
const Writable = require('stream').Writable;
const MessageStream = require('../../../lib/cmap/message_stream');
const Msg = require('../../../lib/core/connection/msg').Msg;
const expect = require('chai').expect;

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

describe('Message Stream', function() {
  describe('reading', function() {
    [
      {
        description: 'valid OP_REPLY',
        data: Buffer.from(
          '370000000100000001000000010000000000000000000000000000000000000001000000130000001069736d6173746572000100000000',
          'hex'
        ),
        documents: [{ ismaster: 1 }]
      },
      {
        description: 'valid OP_MSG',
        data: Buffer.from(
          '370000000100000000000000dd0700000000000000220000001069736d6173746572000100000002246462000600000061646d696e0000',
          'hex'
        ),
        documents: [{ $db: 'admin', ismaster: 1 }]
      },
      {
        description: 'Invalid message size (negative)',
        data: Buffer.from('ffffffff', 'hex'),
        error: 'Invalid message size: -1'
      },
      {
        description: 'Invalid message size (exceeds maximum)',
        data: Buffer.from('01000004', 'hex'),
        error: 'Invalid message size: 67108865, max allowed: 67108864'
      }
    ].forEach(test => {
      it(test.description, function(done) {
        const bson = new BSON();
        const error = test.error;
        const inputStream = bufferToStream(test.data);
        const messageStream = new MessageStream({ bson });

        messageStream.on('message', msg => {
          if (error) {
            done(new Error(`expected error: ${error}`));
            return;
          }

          msg.parse();

          if (test.documents) {
            expect(msg)
              .to.have.property('documents')
              .that.deep.equals(test.documents);
          }

          done();
        });

        messageStream.on('error', err => {
          if (error == null) {
            done(err);
            return;
          }

          expect(err)
            .to.have.property('message')
            .that.equals(error);

          done();
        });

        inputStream.pipe(messageStream);
      });
    });
  });

  describe('writing', function() {
    it('should write a message to the stream', function(done) {
      const readableStream = new Readable({ read() {} });
      const writeableStream = new Writable({
        write: (chunk, _, callback) => {
          readableStream.push(chunk);
          callback();
        }
      });

      readableStream.on('data', data => {
        expect(data.toString('hex')).to.eql(
          '370000000300000000000000dd0700000000000000220000001069736d6173746572000100000002246462000600000061646d696e0000'
        );

        done();
      });

      const bson = new BSON();
      const messageStream = new MessageStream({ bson });
      messageStream.pipe(writeableStream);

      const command = new Msg(bson, 'admin.$cmd', { ismaster: 1 }, { requestId: 3 });
      messageStream.writeCommand(command, null, err => {
        done(err);
      });
    });
  });
});
