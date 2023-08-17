// @ts-check
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getCurrentHistorySection, output } from './util.mjs';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const historyFilePath = path.join(__dirname, '..', '..', 'HISTORY.md');

/**
 * @param {string} history
 * @returns {string[]}
 */
function parsePRList(history) {
  const prRegexp = /node-mongodb-native\/issues\/(?<prNum>\d+)\)/iu;
  return Array.from(
    new Set(
      history
        .split('\n')
        .map(line => prRegexp.exec(line)?.groups?.prNum ?? '')
        .filter(prNum => prNum !== '')
    )
  );
}

const historyContents = await fs.readFile(historyFilePath, { encoding: 'utf8' });

const currentHistorySection = getCurrentHistorySection(historyContents);

const prs = parsePRList(currentHistorySection);

await output('pr_list', prs.join(','));
