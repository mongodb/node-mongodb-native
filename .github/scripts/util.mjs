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
  const VERSION_HEADER = /^#.+\(\d{4}-\d{2}-\d{2}\)$/gm;

  const historyLines = historyContents.split('\n');

  const headerLineIndex = historyLines.findIndex(line => {
    const headerMatches = VERSION_HEADER.exec(line);
    return headerMatches != null;
  });

  const headerLine = historyLines[headerLineIndex];

  if (headerLineIndex < 0) throw new Error('Must contain version header');
  const headerIndex = sum(historyLines.map(({ length }) => length + 1).slice(0, headerLineIndex));

  console.log(
    'Found markdown header for',
    headerIndex,
    JSON.stringify(historyContents.slice(headerIndex, headerIndex + 20))
  );

  const offset = headerIndex + headerLine.length;
  const currentHistoryEnd =
    Number(VERSION_HEADER.exec(historyContents.slice(offset))?.index) + offset;
  if (Number.isNaN(currentHistoryEnd))
    throw new Error(`Expected to find next header after ${offset}`);

  console.log(
    'Found markdown header previous release',
    currentHistoryEnd,
    JSON.stringify(historyContents.slice(currentHistoryEnd, currentHistoryEnd + 20))
  );

  return [
    historyContents.slice(0, headerIndex),
    historyContents.slice(headerIndex, currentHistoryEnd),
    historyContents.slice(currentHistoryEnd)
  ];
}
