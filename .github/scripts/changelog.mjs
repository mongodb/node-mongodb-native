//@ts-check
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as process from 'node:process';
import { Octokit } from '@octokit/core';

// See: https://github.com/googleapis/release-please/issues/1274

const { GITHUB_TOKEN = '', RELEASE_PR: RELEASE_PR_STRING = '' } = process.env;
if (GITHUB_TOKEN === '') throw new Error('GITHUB_TOKEN cannot be empty');

const RELEASE_PR = Number(RELEASE_PR_STRING);
if (!Number.isNaN(Number(RELEASE_PR))) throw new Error('RELEASE_PR must be a Number');

const octokit = new Octokit({ auth: GITHUB_TOKEN });

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const historyFilePath = path.join(__dirname, '..', '..', 'HISTORY.md');

/**
 * Create release content
 * @param {{major: string; minor: string; toString: () => string}} version
 * @param {string} highlights
 * @param {string} history
 * @returns
 */
const releaseContent = (version, header, highlights, history) =>
  `${header}

The MongoDB Node.js team is pleased to announce version ${version} of the \`mongodb\` package!

${highlights}
${history}
## Documentation

* [Reference](https://docs.mongodb.com/drivers/node/current/)
* [API](https://mongodb.github.io/node-mongodb-native/${version.major}.${version.minor}/)
* [Changelog](https://github.com/mongodb/node-mongodb-native/blob/v${version}/HISTORY.md)

We invite you to try the \`mongodb\` library immediately, and report any issues to the [NODE project](https://jira.mongodb.org/projects/NODE).
`;

/**
 * @param {string} history
 * @returns {string[]}
 */
function parsePRList(history) {
  const prRegexp = /\(\[#(?<prNum>\d+)\]\(/g;
  const lines = history.split('\n');
  const prs = [];

  for (const line of lines) {
    if (line.startsWith('* ')) {
      const matches = line.matchAll(prRegexp);
      for (const match of matches) {
        if (match?.groups?.prNum != null) {
          prs.push(match?.groups?.prNum);
        }
      }
    }
  }

  return prs;
}

async function getPullRequestContent(pull_number) {
  const startIndicator = 'RELEASE_HIGHLIGHT_START -->';
  const endIndicator = '<!-- RELEASE_HIGHLIGHT_END';

  const {
    data: { body }
  } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner: 'mongodb',
    repo: 'node-mongodb-native',
    pull_number,
    headers: { 'X-GitHub-Api-Version': '2022-11-28' }
  });

  if (body == null || !(body.includes(startIndicator) && body.includes(endIndicator))) {
    return '';
  }

  const start = body.indexOf('## ', body.indexOf(startIndicator));
  const end = body.indexOf(endIndicator);
  const highlightSection = body.slice(start, end).trim();

  if (highlightSection.length < 10) {
    return '';
  }

  return highlightSection;
}

/**
 * @param {string[]} prs
 */
async function pullRequestHighlights(prs) {
  const highlights = [];
  for (const pr of prs) {
    const content = await getPullRequestContent(pr);
    highlights.push(content);
  }
  return highlights.join('');
}

const versionHeader = /## \[(?<version>.+)\].+$/gm;

const allHistory = await fs.readFile(historyFilePath, { encoding: 'utf8' });
const headerMatches = versionHeader.exec(allHistory);
if (headerMatches == null) throw new Error('Must contain version header');

const nextVersionString = headerMatches.groups?.version;
if (nextVersionString == null) throw new Error('Must have version');

const versionSectionEndIndex = allHistory.indexOf('## [', headerMatches.index + 4);
let nextVersionHistory = allHistory.slice(
  headerMatches.index,
  versionSectionEndIndex
);

const historyParts = nextVersionHistory.split('\n');
const header = historyParts[0];
nextVersionHistory = historyParts.slice(1).join('\n').trim();

const prs = parsePRList(nextVersionHistory);
const prHighlights = await pullRequestHighlights(prs);
const releaseNotes = releaseContent(
  {
    toString: () => nextVersionString,
    major: nextVersionString.split('.')[0],
    minor: nextVersionString.split('.')[1]
  },
  header,
  prHighlights,
  nextVersionHistory
);

console.log(releaseNotes);

await octokit.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
  owner: 'mongodb',
  repo: 'node-mongodb-native',
  pull_number: RELEASE_PR,
  headers: { 'X-GitHub-Api-Version': '2022-11-28' },
  body: releaseNotes
})

const beforeVersionSection = allHistory.slice(0, headerMatches.index);
const afterVersionSection = allHistory.slice(versionSectionEndIndex)

await fs.writeFile(historyFilePath, beforeVersionSection + releaseNotes + '\n' + afterVersionSection);
