// usage: node expand-task.js <task name>
// must be run from root of the Node driver

import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { Readable } from 'stream';
import { inspect } from 'util';

const config = load(readFileSync('.evergreen/config.yml'));
const taskName = (process.argv[2] ?? '').trim();

const task = config.tasks.find(({ name }) => name === taskName);

if (!task) {
  process.exit();
}

const commands = task.commands.flatMap(({ func }) => config.functions[func]);

if (process.stdout.isTTY) {
  console.log(inspect(commands, { depth: Infinity, colors: true }));
} else {
  Readable.from(commands)
    .map(command => JSON.stringify(command))
    .pipe(process.stdout);
}
