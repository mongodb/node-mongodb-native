// @ts-check
import * as process from 'node:process';
import { Octokit } from '@octokit/core';
import { output } from './util.mjs';

const {
  GITHUB_TOKEN = '',
  PR_LIST = '',
  owner = 'mongodb',
  repo = 'node-mongodb-native'
} = process.env;
if (GITHUB_TOKEN === '') throw new Error('GITHUB_TOKEN cannot be empty');

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
  log: {
    debug: msg => console.error('Octokit.debug', msg),
    info: msg => console.error('Octokit.info', msg),
    warn: msg => console.error('Octokit.warn', msg),
    error: msg => console.error('Octokit.error', msg)
  }
});

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
    const res = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner,
      repo,
      pull_number,
      headers: { 'X-GitHub-Api-Version': '2022-11-28' }
    });
    body = res.data.body;
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
