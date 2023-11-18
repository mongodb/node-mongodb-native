import { expect } from 'chai';
import * as sinon from 'sinon';
import { EventEmitter } from 'stream';
import { setTimeout } from 'timers/promises';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import * as compression from '../../../src/cmap/wire_protocol/compression';
import {
  decompressResponse,
  LEGACY_HELLO_COMMAND,
  MongoDecompressionError,
  MongoParseError,
  OP_COMPRESSED,
  OP_MSG,
  OpCompressedRequest,
  OpMsgRequest,
  OpMsgResponse,
  type OpQueryResponse,
  read,
  readMany,
  writeCommand
} from '../../mongodb';

class MockSocket extends EventEmitter {
  buffer: Buffer[] = [];
  write(b: Buffer, cb: (e?: Error) => void) {
    this.buffer.push(b);
    queueMicrotask(cb);
  }
}

class MockModernConnection {
  socket = new MockSocket();
}

describe.skip('writeCommand', () => {
  context('when compression is disabled', () => {
    it('pushes an uncompressed command into the socket buffer', async () => {
      const command = new OpMsgRequest('db', { find: 1 }, { requestId: 1 });
      const connection = new MockModernConnection();
      const prom = writeCommand(connection as any, command, {
        agreedCompressor: 'none'
      });

      connection.socket.emit('drain');
      await prom;

      const [buffer] = connection.socket.buffer;
      expect(buffer).to.exist;
      const opCode = buffer.readInt32LE(12);

      expect(opCode).to.equal(OP_MSG);
    });
  });

  context('when compression is enabled', () => {
    context('when the command is compressible', () => {
      it('pushes a compressed command into the socket buffer', async () => {
        const command = new OpMsgRequest('db', { find: 1 }, { requestId: 1 });
        const connection = new MockModernConnection();
        const prom = writeCommand(connection as any, command, {
          agreedCompressor: 'snappy'
        });

        connection.socket.emit('drain');
        await prom;

        const [buffer] = connection.socket.buffer;
        expect(buffer).to.exist;
        const opCode = buffer.readInt32LE(12);

        expect(opCode).to.equal(OP_COMPRESSED);
      });
    });
    context('when the command is not compressible', () => {
      it('pushes an uncompressed command into the socket buffer', async () => {
        const command = new OpMsgRequest('db', { [LEGACY_HELLO_COMMAND]: 1 }, { requestId: 1 });
        const connection = new MockModernConnection();
        const prom = writeCommand(connection as any, command, {
          agreedCompressor: 'snappy'
        });

        connection.socket.emit('drain');
        await prom;

        const [buffer] = connection.socket.buffer;
        expect(buffer).to.exist;
        const opCode = buffer.readInt32LE(12);

        expect(opCode).to.equal(OP_MSG);
      });
    });
  });
  context('when a `drain` event is not emitted from the underlying socket', () => {
    it('never resolves', async () => {
      const connection = new MockModernConnection();
      const promise = writeCommand(connection, new OpMsgRequest('db', { ping: 1 }, {}), {
        agreedCompressor: 'none'
      });
      const result = await Promise.race([promise, setTimeout(1000, 'timeout', { ref: false })]);
      expect(result).to.equal('timeout');
    });
  });

  context('when a `drain` event is emitted from the underlying socket', () => {
    it('resolves', async () => {
      const connection = new MockModernConnection();
      connection.socket.write = () => null;
      const promise = writeCommand(connection, new OpMsgRequest('db', { ping: 1 }, {}), {
        agreedCompressor: 'none'
      });
      connection.socket.emit('drain');
      const result = await Promise.race([promise, setTimeout(5000, 'timeout', { ref: false })]);
      expect(result).to.be.undefined;
    });
  });
});

describe('decompressResponse()', () => {
  context('when the message is not compressed', () => {
    let message: Buffer;
    let response: OpMsgResponse | OpQueryResponse;
    let spy;
    beforeEach(async () => {
      message = Buffer.concat(new OpMsgRequest('db', { find: 1 }, { requestId: 1 }).toBin());
      spy = sinon.spy(compression, 'decompress');

      response = await decompressResponse(message);
    });
    afterEach(() => sinon.restore());
    it('returns a wire protocol message', () => {
      expect(response).to.be.instanceOf(OpMsgResponse);
    });
    it('does not attempt decompression', () => {
      expect(spy).not.to.have.been.called;
    });
  });

  context('when the message is compressed', () => {
    let message: Buffer;
    let response: OpMsgResponse | OpQueryResponse;
    beforeEach(async () => {
      const msg = new OpMsgRequest('db', { find: 1 }, { requestId: 1 });
      message = Buffer.concat(
        await new OpCompressedRequest(msg, {
          zlibCompressionLevel: 0,
          agreedCompressor: 'snappy'
        }).toBin()
      );

      response = await decompressResponse(message);
    });

    it('returns a wire protocol message', () => {
      expect(response).to.be.instanceOf(OpMsgResponse);
    });
    it('correctly decompresses the message', () => {
      response.parse({});
      expect(response.documents[0]).to.deep.equal({ $db: 'db', find: 1 });
    });

    context(
      'when the compressed message does not match the compression metadata in the header',
      () => {
        beforeEach(async () => {
          const msg = new OpMsgRequest('db', { find: 1 }, { requestId: 1 });
          message = Buffer.concat(
            await new OpCompressedRequest(msg, {
              zlibCompressionLevel: 0,
              agreedCompressor: 'snappy'
            }).toBin()
          );
          message.writeInt32LE(
            100,
            16 + 4 // message header size + offset to length
          ); // write an invalid message length into the header
        });
        it('throws a MongoDecompressionError', async () => {
          const error = await decompressResponse(message).catch(e => e);
          expect(error).to.be.instanceOf(MongoDecompressionError);
        });
      }
    );
  });
});

describe('read()', () => {
  let connection: MockModernConnection;
  let message: Buffer;

  beforeEach(() => {
    connection = new MockModernConnection();
    message = Buffer.concat(new OpMsgRequest('db', { ping: 1 }, { requestId: 1 }).toBin());
  });
  it('does not resolve if there are no data events', async () => {
    const promise = read(connection);
    const result = await Promise.race([promise, setTimeout(1000, 'timeout', { ref: false })]);
    expect(result).to.equal('timeout');
  });

  it('does not resolve until there is a complete message', async () => {
    const promise = read(connection);
    {
      const result = await Promise.race([promise, setTimeout(1000, 'timeout', { ref: false })]);
      expect(result, 'received data on empty socket').to.equal('timeout');
    }

    {
      connection.socket.emit('data', message.slice(0, 10));
      const result = await Promise.race([promise, setTimeout(1000, 'timeout', { ref: false })]);
      expect(
        result,
        'received data when only part of message was emitted from the socket'
      ).to.equal('timeout');
    }

    {
      connection.socket.emit('data', message.slice(10));
      const result = await Promise.race([promise, setTimeout(1000, 'timeout', { ref: false })]);
      expect(result, 'expected OpMsgResponse - got timeout instead').to.be.instanceOf(
        OpMsgResponse
      );
    }
  });

  it('removes all event listeners from the socket after a message is received', async () => {
    const promise = read(connection);

    connection.socket.emit('data', message);
    await promise;

    expect(connection.socket.listenerCount('data')).to.equal(0);
  });

  it('when `moreToCome` is set in the response, it only returns one message', async () => {
    message = Buffer.concat(
      new OpMsgRequest('db', { ping: 1 }, { requestId: 1, moreToCome: true }).toBin()
    );

    const promise = read(connection);

    connection.socket.emit('data', message);
    await promise;

    expect(connection.socket.listenerCount('data')).to.equal(0);
  });

  context('when reading an invalid message', () => {
    context('when the message < 0', () => {
      it('throws a mongo parse error', async () => {
        message.writeInt32LE(-1);
        const promise = read(connection).catch(e => e);

        connection.socket.emit('data', message);
        const error = await promise;
        expect(error).to.be.instanceof(MongoParseError);
      });
    });

    context('when the message length > max bson message size', () => {
      it('throws a mongo parse error', async () => {
        message.writeInt32LE(1024 * 1024 * 16 * 4 + 1);
        const promise = read(connection).catch(e => e);

        connection.socket.emit('data', message);
        const error = await promise;
        expect(error).to.be.instanceof(MongoParseError);
      });
    });
  });

  context('when compression is enabled', () => {
    it('returns a decompressed message', async () => {
      const message = Buffer.concat(
        await new OpCompressedRequest(
          new OpMsgRequest('db', { ping: 1 }, { requestId: 1, moreToCome: true }),
          { zlibCompressionLevel: 0, agreedCompressor: 'snappy' }
        ).toBin()
      );

      const promise = read(connection);

      connection.socket.emit('data', message);
      const result = await promise;

      expect(result).to.be.instanceOf(OpMsgResponse);
    });
  });
});

describe('readMany()', () => {
  let connection: MockModernConnection;
  let message: Buffer;

  beforeEach(() => {
    connection = new MockModernConnection();
    message = Buffer.concat(new OpMsgRequest('db', { ping: 1 }, { requestId: 1 }).toBin());
  });
  it('does not resolve if there are no data events', async () => {
    const generator = readMany(connection);
    const result = await Promise.race([
      generator.next(),
      setTimeout(1000, 'timeout', { ref: false })
    ]);
    expect(result).to.equal('timeout');
  });

  it('does not resolve until there is a complete message', async () => {
    const generator = readMany(connection);
    const promise = generator.next();
    {
      const result = await Promise.race([promise, setTimeout(1000, 'timeout', { ref: false })]);
      expect(result, 'received data on empty socket').to.equal('timeout');
    }

    {
      connection.socket.emit('data', message.slice(0, 10));
      const result = await Promise.race([promise, setTimeout(1000, 'timeout', { ref: false })]);
      expect(
        result,
        'received data when only part of message was emitted from the socket'
      ).to.equal('timeout');
    }

    {
      connection.socket.emit('data', message.slice(10));
      const result = await Promise.race([promise, setTimeout(1000, 'timeout', { ref: false })]);
      expect(result.value, 'expected OpMsgResponse - got timeout instead').to.be.instanceOf(
        OpMsgResponse
      );
    }
  });

  it('when moreToCome is set, it does not remove `data` listeners after receiving a message', async () => {
    const generator = readMany(connection);
    const promise = generator.next();
    message = Buffer.concat(
      new OpMsgRequest('db', { ping: 1 }, { requestId: 1, moreToCome: true }).toBin()
    );
    connection.socket.emit('data', message);

    const { value: response } = await promise;

    expect(response).to.be.instanceOf(OpMsgResponse);
    expect(connection.socket.listenerCount('data')).to.equal(1);
  });

  it('returns messages until `moreToCome` is false', async () => {
    const generator = readMany(connection);

    for (
      let i = 0,
        message = Buffer.concat(
          new OpMsgRequest('db', { ping: 1 }, { requestId: 1, moreToCome: true }).toBin()
        );
      i < 3;
      ++i
    ) {
      const promise = generator.next();
      connection.socket.emit('data', message);
      const { value: response } = await promise;
      expect(response, `response ${i} was not OpMsgResponse`).to.be.instanceOf(OpMsgResponse);
      expect(
        connection.socket.listenerCount('data'),
        `listener count for ${i} was non-zero`
      ).to.equal(1);
    }

    const message = Buffer.concat(
      new OpMsgRequest('db', { ping: 1 }, { requestId: 1, moreToCome: false }).toBin()
    );
    const promise = generator.next();
    connection.socket.emit('data', message);
    const { value: response } = await promise;
    expect(response, `response was not OpMsgResponse`).to.be.instanceOf(OpMsgResponse);
    expect(connection.socket.listenerCount('data')).to.equal(1);

    await generator.next();
    expect(connection.socket.listenerCount('data')).to.equal(0);
  });

  context('when reading an invalid message', () => {
    context('when the message < 0', () => {
      it('throws a mongo parse error', async () => {
        message.writeInt32LE(-1);
        const promise = readMany(connection)
          .next()
          .catch(e => e);

        connection.socket.emit('data', message);
        const error = await promise;
        expect(error).to.be.instanceof(MongoParseError);
      });
    });

    context('when the message length > max bson message size', () => {
      it('throws a mongo parse error', async () => {
        message.writeInt32LE(1024 * 1024 * 16 * 4 + 1);
        const promise = readMany(connection)
          .next()
          .catch(e => e);

        connection.socket.emit('data', message);
        const error = await promise;
        expect(error).to.be.instanceof(MongoParseError);
      });
    });
  });

  context('when compression is enabled', () => {
    it('returns a decompressed message', async () => {
      const message = Buffer.concat(
        await new OpCompressedRequest(new OpMsgRequest('db', { ping: 1 }, { requestId: 1 }), {
          zlibCompressionLevel: 0,
          agreedCompressor: 'snappy'
        }).toBin()
      );

      const generator = readMany(connection);
      const promise = generator.next();
      connection.socket.emit('data', message);
      const { value: response } = await promise;

      expect(response).to.be.instanceOf(OpMsgResponse);
    });
  });
});
