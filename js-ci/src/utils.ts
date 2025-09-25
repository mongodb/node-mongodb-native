import * as cp from 'child_process';
import { once } from 'events';
import { type Writable } from 'stream';
import { pipeline } from 'stream/promises';

export const stdout: Writable & { writeln: (s: string) => void } = Object.create(process.stdout, {
  writeln: { value: (line: string) => process.stdout.write(`${line}\n`) }
});

function logStream(prefix?: string) {
  async function* lines(generator: AsyncIterable<string>) {
    let buffer: string = '';
    for await (const data of generator) {
      buffer += data;
      const chunks = buffer.split('\n');
      if (chunks.length === 1) {
        continue;
      }

      for (const chunk of chunks.slice(0, chunks.length - 1)) {
        yield `${chunk}\n`;
      }

      buffer = chunks[chunks.length - 1];
    }
    if (buffer) yield `${buffer}\n`;
  }

  async function* addPrefix(generator: AsyncIterable<string>) {
    for await (const chunk of generator) {
      yield `[${prefix}] ${chunk}`;
    }
  }
  return async function* (generator: AsyncIterable<string>) {
    if (!prefix) {
      yield* generator;
      return;
    }
    yield* addPrefix(lines(generator));
  };
}

export async function spawn(cmdWithArgs: string, env: NodeJS.ProcessEnv, log_prefix?: string) {
  const [cmd, ...args] = cmdWithArgs.split(' ').filter(Boolean);
  const child_process = cp.spawn(cmd, args, {
    env
  });

  const stdout$ = pipeline(child_process.stdout, logStream(log_prefix), process.stdout, {
    end: false
  });

  const stderr$ = pipeline(child_process.stderr, logStream(log_prefix), process.stdout, {
    end: false
  });

  await Promise.all([once(child_process, 'exit'), stdout$, stderr$]);
}
