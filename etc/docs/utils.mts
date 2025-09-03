import { createInterface } from 'readline';
import * as util from 'util';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

export const LATEST_TAG = 'Next';

export interface JsonVersionSchema {
  version: string;
}

export interface VersionSchema {
  version: string;
  status: 'supported' | 'not-supported' | 'latest' | 'next';
  api: string;
  usesMongoDBManual?: boolean;
  docs?: string;
  tag: string;
}

export interface TomlVersionSchema {
  current: string;
  mongodDBManual: string;
  versions: VersionSchema[];
}

const capitalize = (s: string) =>
  s.length === 0 ? s : s[0].toUpperCase() + s.slice(1).toLowerCase();

util.inspect.defaultOptions.breakLength = 1000;
util.inspect.defaultOptions.depth = 1000;
// eslint-disable-next-line no-console
export const log = (...args: any[]) => console.error(args);

function prompt(prompt: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr
  });

  return new Promise((resolve, _) => {
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function confirm(message: string) {
  const response = await prompt(message);
  if (response !== 'y') {
    log('something went wrong.  Exiting...');
    process.exit(1);
  }
}

export async function getCommandLineArguments(): Promise<{
  tag: string;
  status: VersionSchema['status'];
  skipPrompts;
}> {
  const {
    status,
    tag,
    yes: skipPrompts
  } = yargs(hideBin(process.argv))
    .option('tag', {
      type: 'string',
      description: 'The identifier for the version of the docs to update.',
      requiresArg: true,
      default: LATEST_TAG
    })
    .option('status', {
      type: 'string',
      choices: ['supported', 'not-supported', 'latest', 'next'],
      default: 'latest',
      requiresArg: true
    })
    .option('yes', {
      type: 'boolean',
      default: false,
      requiresArg: false,
      description: 'If set, will skip any prompts.'
    }).argv;

  return {
    tag: capitalize(tag),
    status: tag.toLowerCase().includes('next') ? 'next' : status,
    skipPrompts
  };
}

export function customSemverCompare(a: string, b: string) {
  [a, b] = [a.toLowerCase(), b.toLowerCase()];

  // 'next' always bubbles to the front of the list
  if ([a, b].includes('next')) {
    return a === 'next' ? -1 : 1;
  }

  const [majorA, minorA] = a.split('.').map(Number);
  const [majorB, minorB] = b.split('.').map(Number);

  if (majorA === majorB) {
    if (minorA === minorB) {
      return 0;
    }
    return minorB > minorA ? 1 : -1;
  }

  return majorB > majorA ? 1 : -1;
}
