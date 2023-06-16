// usage: node expand-task.js <task name>
// must be run from root of the Node driver
//
// The output is pipeable: `node expand-task.js <task name> | jq '.'`

import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { gte } from 'semver';
import { Readable } from 'stream';
import { inspect } from 'util';

if (!gte(process.version, '16.0.0')) {
  console.error('expand-tasks.mjs requires Node16+');
  process.exit(1);
}

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
