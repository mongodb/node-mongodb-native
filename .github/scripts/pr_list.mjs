// @ts-check
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as process from 'node:process';
import { getCurrentHistorySection, output } from './util.mjs';

const { GITHUB_OUTPUT = '' } = process.env;
if (GITHUB_OUTPUT.length === 0) throw new Error('Expected GITHUB_OUTPUT file path');

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const historyFilePath = path.join(__dirname, '..', '..', 'HISTORY.md');

/**
 * @param {string} history
 * @returns {string[]}
 */
function parsePRList(history) {
  const prRegexp = /node-mongodb-native\/issues\/(?<prNum>\d+)\)/giu;
  const lines = history.split('\n');
  const prs = [];

  for (const line of lines) {
    const match = prRegexp.exec(line);
    if (match?.groups?.prNum != null) {
      prs.push(match.groups.prNum);
    }
  }

  return prs;
}

const historyContents = await fs.readFile(historyFilePath, { encoding: 'utf8' });

const [, currentHistorySection] = await getCurrentHistorySection(historyContents);

const prs = parsePRList(currentHistorySection);

output('pr_list', prs.join(','));
