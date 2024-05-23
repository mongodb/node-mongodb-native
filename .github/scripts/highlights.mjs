// @ts-check
import * as process from 'node:process';
import { output } from './util.mjs';

const {
  GITHUB_TOKEN = '',
  PR_LIST = '',
  REPOSITORY = ''
} = process.env;
if (GITHUB_TOKEN === '') throw new Error('GITHUB_TOKEN cannot be empty');
if (REPOSITORY === '') throw new Error('REPOSITORY cannot be empty')

const API_REQ_INFO = {
  headers: {
    Accept: 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${GITHUB_TOKEN}`
  }
}

const prs = PR_LIST.split(',').map(pr => {
  const prNum = Number(pr);
  if (Number.isNaN(prNum))
    throw Error(`expected PR number list: ${PR_LIST}, offending entry: ${pr}`);
  return prNum;
});

/** @param {number} pull_number */
async function getPullRequestContent(pull_number) {
  const startIndicator = 'RELEASE_HIGHLIGHT_START -->';
  const endIndicator = '<!-- RELEASE_HIGHLIGHT_END';

  let body;
  try {
    const response = await fetch(new URL(`https://api.github.com/repos/${REPOSITORY}/pulls/${pull_number}`), API_REQ_INFO);
    if (!response.ok) throw new Error(await response.text());
    const pr = await response.json();
    body = pr.body;
  } catch (error) {
    console.log(`Could not get PR ${pull_number}, skipping. ${error.status}`);
    return '';
  }

  if (body == null || !(body.includes(startIndicator) && body.includes(endIndicator))) {
    console.log(`PR #${pull_number} has no highlight`);
    return '';
  }

  const start = body.indexOf('### ', body.indexOf(startIndicator));
  const end = body.indexOf(endIndicator);
  const highlightSection = body.slice(start, end).trim();

  console.log(`PR #${pull_number} has a highlight ${highlightSection.length} characters long`);
  return highlightSection;
}

/** @param {number[]} prs */
async function pullRequestHighlights(prs) {
  const highlights = [];
  for (const pr of prs) {
    const content = await getPullRequestContent(pr);
    highlights.push(content);
  }
  if (!highlights.length) return '';

  highlights.unshift('## Release Notes\n\n');

  const highlight = highlights.join('\n\n');
  console.log(`Total highlight is ${highlight.length} characters long`);
  return highlight;
}

console.log('List of PRs to collect highlights from:', prs);
const highlights = await pullRequestHighlights(prs);

await output('highlights', JSON.stringify({ highlights }));
