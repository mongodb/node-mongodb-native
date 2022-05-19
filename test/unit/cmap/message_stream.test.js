'use strict';
const Readable = require('stream').Readable;
const Writable = require('stream').Writable;
const { MessageStream } = require('../../../src/cmap/message_stream');
const { Msg } = require('../../../src/cmap/commands');
const expect = require('chai').expect;
const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');
const { generateOpMsgBuffer } = require('../../tools/utils');

function bufferToStream(buffer) {
  const stream = new Readable();
  if (Array.isArray(buffer)) {
    buffer.forEach(b => stream.push(b));
  } else {
    stream.push(buffer);
  }

  stream.push(null);
  return stream;
}

describe('MessageStream', function () {
  context('when the stream uses the streaming protocol', function () {
    const response = { isWritablePrimary: true };
    let firstHello;
    let secondHello;
    let thirdHello;

    beforeEach(function () {
      firstHello = generateOpMsgBuffer(response);
      secondHello = generateOpMsgBuffer(response);
      thirdHello = generateOpMsgBuffer(response);
    });

    it('only reads the last message in the buffer', function (done) {
      const inputStream = bufferToStream(Buffer.concat([firstHello, secondHello, thirdHello]));
      const messageStream = new MessageStream();
      messageStream.isStreamingProtocol = true;

      messageStream.once('message', msg => {
        msg.parse();
        expect(msg).to.have.property('documents').that.deep.equals([response]);
        // Make sure there is nothing left in the buffer.
        expect(messageStream.buffer.length).to.equal(0);
        done();
      });

      inputStream.pipe(messageStream);
    });
  });

  context('when the stream is not using the streaming protocol', function () {
    context('when the messages are valid', function () {
      const response = { isWritablePrimary: true };
      let firstHello;
      let secondHello;
      let thirdHello;
      let messageCount = 0;

      beforeEach(function () {
        firstHello = generateOpMsgBuffer(response);
        secondHello = generateOpMsgBuffer(response);
        thirdHello = generateOpMsgBuffer(response);
      });

      it('reads all messages in the buffer', function (done) {
        const inputStream = bufferToStream(Buffer.concat([firstHello, secondHello, thirdHello]));
        const messageStream = new MessageStream();

        messageStream.on('message', msg => {
          messageCount++;
          msg.parse();
          expect(msg).to.have.property('documents').that.deep.equals([response]);
          // Test will not complete until 3 messages processed.
          if (messageCount === 3) {
            done();
          }
        });

        inputStream.pipe(messageStream);
      });
    });

    context('when the messages are invalid', function () {
      context('when the message size is negative', function () {
        it('emits an error', function (done) {
          const inputStream = bufferToStream(Buffer.from('ffffffff', 'hex'));
          const messageStream = new MessageStream();

          messageStream.on('error', err => {
            expect(err).to.have.property('message').that.equals('Invalid message size: -1');
            done();
          });

          inputStream.pipe(messageStream);
        });
      });

      context('when the message size exceeds the bson maximum', function () {
        it('emits an error', function (done) {
          const inputStream = bufferToStream(Buffer.from('01000004', 'hex'));
          const messageStream = new MessageStream();

          messageStream.on('error', err => {
            expect(err)
              .to.have.property('message')
              .that.equals('Invalid message size: 67108865, max allowed: 67108864');
            done();
          });

          inputStream.pipe(messageStream);
        });
      });
    });
  });

  context('when writing to the message stream', function () {
    it('pushes the message', function (done) {
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

      const messageStream = new MessageStream();
      messageStream.pipe(writeableStream);

      const command = new Msg('admin.$cmd', { [LEGACY_HELLO_COMMAND]: 1 }, { requestId: 3 });
      messageStream.writeCommand(command, null, err => {
        done(err);
      });
    });
  });
});
