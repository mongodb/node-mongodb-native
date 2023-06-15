// @ts-check
import * as process from 'node:process';
import * as fs from 'node:fs/promises';

/**
 * @param {number[]} array
 */
function sum(array) {
  return array.reduce((acc, n) => {
    acc += n;
    return acc;
  }, 0);
}

export async function output(key, value) {
  const { GITHUB_OUTPUT = '' } = process.env;
  const output = `${key}=${value}\n`;
  console.log('outputting:', output);

  if (GITHUB_OUTPUT.length === 0) {
    console.log('GITHUB_OUTPUT not defined, printing only');
    return;
  }

  const outputFile = await fs.open(GITHUB_OUTPUT, 'a');
  await outputFile.appendFile(output, { encoding: 'utf8' });
  await outputFile.close();
}

/**
 * @param {string} historyContents
 * @returns {Promise<[string, string, string]>}
 */
export async function getCurrentHistorySection(historyContents) {
  /** Markdown version header */
  const VERSION_HEADER = /^#.+\(\d{4}-\d{2}-\d{2}\)$/g;

  const historyLines = historyContents.split('\n');

  // Search for the line with the first version header, this will be the one we're releasing
  const headerLineIndex = historyLines.findIndex(line => VERSION_HEADER.test(line));
  if (headerLineIndex < 0) throw new Error('Must contain version header');

  console.log('Found markdown header current release', headerLineIndex, ':', historyLines[headerLineIndex]);

  // Search lines starting after the first header, and add back the offset we sliced at
  const nextHeaderLineIndex = historyLines
    .slice(headerLineIndex + 1)
    .findIndex(line => VERSION_HEADER.test(line)) + headerLineIndex + 1;
  if (nextHeaderLineIndex < 0) throw new Error('Must contain version header');

  console.log('Found markdown header previous release', nextHeaderLineIndex, ':', historyLines[nextHeaderLineIndex]);

  return [
    historyLines.slice(0, headerLineIndex).join('\n'),
    historyLines.slice(headerLineIndex, nextHeaderLineIndex).join('\n'),
    historyLines.slice(nextHeaderLineIndex).join('\n')
  ];
}
