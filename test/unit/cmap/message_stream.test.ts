import { expect } from 'chai';
import { on, once } from 'events';
import { Readable, Writable } from 'stream';

import { LEGACY_HELLO_COMMAND, MessageStream, Msg } from '../../mongodb';
import { bufferToStream, generateOpMsgBuffer } from '../../tools/utils';

describe('MessageStream', function () {
  context('when the stream is for a monitoring connection', function () {
    const response = { isWritablePrimary: true };
    const lastResponse = { ok: 1 };
    let firstHello;
    let secondHello;
    let thirdHello;
    let partial;

    beforeEach(function () {
      firstHello = generateOpMsgBuffer(response);
      secondHello = generateOpMsgBuffer(response);
      thirdHello = generateOpMsgBuffer(lastResponse);
      partial = Buffer.alloc(5);
      partial.writeInt32LE(100, 0);
    });

    it('only reads the last message in the buffer', async function () {
      const inputStream = bufferToStream(Buffer.concat([firstHello, secondHello, thirdHello]));
      const messageStream = new MessageStream();
      messageStream.isMonitoringConnection = true;

      inputStream.pipe(messageStream);
      const messages = await once(messageStream, 'message');
      const msg = messages[0];
      msg.parse();
      expect(msg).to.have.property('documents').that.deep.equals([lastResponse]);
      // Make sure there is nothing left in the buffer.
      expect(messageStream.buffer.length).to.equal(0);
    });

    it('does not read partial messages', async function () {
      const inputStream = bufferToStream(
        Buffer.concat([firstHello, secondHello, thirdHello, partial])
      );
      const messageStream = new MessageStream();
      messageStream.isMonitoringConnection = true;

      inputStream.pipe(messageStream);
      const messages = await once(messageStream, 'message');
      const msg = messages[0];
      msg.parse();
      expect(msg).to.have.property('documents').that.deep.equals([lastResponse]);
      // Make sure the buffer wasn't read to the end.
      expect(messageStream.buffer.length).to.equal(5);
    });
  });

  context('when the stream is not for a monitoring connection', function () {
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

      it('reads all messages in the buffer', async function () {
        const inputStream = bufferToStream(Buffer.concat([firstHello, secondHello, thirdHello]));
        const messageStream = new MessageStream();

        inputStream.pipe(messageStream);
        for await (const messages of on(messageStream, 'message')) {
          messageCount++;
          const msg = messages[0];
          msg.parse();
          expect(msg).to.have.property('documents').that.deep.equals([response]);
          // Test will not complete until 3 messages processed.
          if (messageCount === 3) {
            return;
          }
        }
      });
    });

    context('when the messages are invalid', function () {
      context('when the message size is negative', function () {
        it('emits an error', async function () {
          const inputStream = bufferToStream(Buffer.from('ffffffff', 'hex'));
          const messageStream = new MessageStream();

          inputStream.pipe(messageStream);
          const errors = await once(messageStream, 'error');
          const err = errors[0];
          expect(err).to.have.property('message').that.equals('Invalid message size: -1');
        });
      });

      context('when the message size exceeds the bson maximum', function () {
        it('emits an error', async function () {
          const inputStream = bufferToStream(Buffer.from('01000004', 'hex'));
          const messageStream = new MessageStream();

          inputStream.pipe(messageStream);
          const errors = await once(messageStream, 'error');
          const err = errors[0];
          expect(err)
            .to.have.property('message')
            .that.equals('Invalid message size: 67108865, max allowed: 67108864');
        });
      });
    });
  });

  context('when writing to the message stream', function () {
    it('pushes the message', function (done) {
      const readableStream = new Readable({
        read() {
          // ignore
        }
      });
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
      messageStream.writeCommand(command, {
        started: 0,
        command: true,
        noResponse: false,
        raw: false,
        requestId: command.requestId,
        cb: err => {
          done(err);
        }
      });
    });
  });
});
