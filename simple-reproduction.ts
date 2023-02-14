import { createConnection, createServer } from 'net';
import { Duplex } from 'stream';
import { setTimeout } from 'timers/promises';

function makeServer() {
  const server = createServer();

  const connections = new Set();

  server.on('connection', socket => {
    socket.on('data', d => {
      console.log('received data', d.toString('utf-8'));
      setTimeout(250).then(() => {
        socket.write(d);
      });
    });

    socket.on('error', e => console.error(e));

    socket.on('end', () => console.error('end'));

    connections.add(socket);
  });

  server.listen(3000);

  return server;
}

makeServer();

class CustomMessageStream extends Duplex {
  constructor() {
    super({ emitClose: true });
  }
  buffer: Array<any> = [];

  _read() {}

  _write(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void
  ): void {
    this.buffer.push(chunk.toString('utf-8'));
    if (this.buffer.length === 5) {
      this.emit('message', this.buffer.join('-'));
      this.buffer = [];
    }
    callback();
  }

  writeCommand(command) {
    this.push(command);
  }
}

async function write(stream: CustomMessageStream, signal: AbortSignal) {
  let i = 0;
  while (!signal.aborted) {
    stream.writeCommand(i.toString());
    ++i;
    await setTimeout(250, { signal });
  }
}

async function main() {
  const connection = createConnection(3000);
  const messageStream = new CustomMessageStream();

  // the setup here is identical to the setup in Connection
  messageStream.on('message', d => console.error(d));
  messageStream.on('error', error => {
    console.error('message stream error');
  });
  connection.on('close', () => console.error('connection closed'));
  connection.on('timeout', () => console.error('connection timeout'));
  connection.on('error', () => {
    /* ignore errors, listen to `close` instead */
  });

  // hook the message stream up to the passed in stream
  connection.pipe(messageStream);
  messageStream.pipe(connection);

  const controller = new AbortController();
  write(messageStream, controller.signal);

  await setTimeout(5000);

  controller.abort();

  messageStream.destroy();
  connection.end(() => {
    console.error('ended');
  });
}

main();
