// @ts-check
import * as process from 'process';
import * as fs from 'node:fs/promises';

export async function output(key, value) {
  const { GITHUB_OUTPUT = '' } = process.env;
  const output = `${key}=${value}\n`;
  console.log('outputting:', output);

  if (GITHUB_OUTPUT.length === 0) {
    // This is always defined in Github actions, and if it is not for some reason, tasks that follow will fail.
    // For local testing it's convenient to see what scripts would output without requiring the variable to be defined.
    console.log('GITHUB_OUTPUT not defined, printing only');
    return;
  }

  const outputFile = await fs.open(GITHUB_OUTPUT, 'a');
  await outputFile.appendFile(output, { encoding: 'utf8' });
  await outputFile.close();
}

/**
 * @param {string} historyContents
 * @returns {string}
 */
export function getCurrentHistorySection(historyContents) {
  /** Markdown version header */
  const VERSION_HEADER = /^#.+\(\d{4}-\d{2}-\d{2}\)$/g;

  const historyLines = historyContents.split('\n');

  // Search for the line with the first version header, this will be the one we're releasing
  const headerLineIndex = historyLines.findIndex(line => VERSION_HEADER.test(line));
  if (headerLineIndex < 0) throw new Error('Could not find any version header');

  console.log('Found markdown header current release', headerLineIndex, ':', historyLines[headerLineIndex]);

  // Search lines starting after the first header, and add back the offset we sliced at
  const nextHeaderLineIndex = historyLines
    .slice(headerLineIndex + 1)
    .findIndex(line => VERSION_HEADER.test(line)) + headerLineIndex + 1;
  if (nextHeaderLineIndex < 0) throw new Error(`Could not find previous version header, searched ${headerLineIndex + 1}`);

  console.log('Found markdown header previous release', nextHeaderLineIndex, ':', historyLines[nextHeaderLineIndex]);

  return historyLines.slice(headerLineIndex, nextHeaderLineIndex).join('\n');
}
