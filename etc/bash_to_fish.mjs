import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

/**
 * Takes an "exports" only bash script file
 * and converts it to fish syntax.
 * Will crash on any line that isn't:
 * - a comment
 * - an empty line
 * - a bash 'set' call
 * - export VAR=VAL
 */

const fileName = process.argv[2];
const outFileName = path.basename(fileName, '.sh') + '.fish';
const input = createReadStream(process.argv[2]);
const lines = readline.createInterface({ input });
const output = await fs.open(outFileName, 'w');

for await (let line of lines) {
  line = line.trim();

  if (!line.startsWith('export ')) {
    if (line.startsWith('#')) continue;
    if (line === '') continue;
    if (line.startsWith('set')) continue;
    throw new Error('Cannot translate: ' + line);
  }

  const varVal = line.slice('export '.length);
  const variable = varVal.slice(0, varVal.indexOf('='));
  const value = varVal.slice(varVal.indexOf('=') + 1);
  output.appendFile(`set -x ${variable} ${value}\n`);
}

output.close();
input.close();
lines.close();
