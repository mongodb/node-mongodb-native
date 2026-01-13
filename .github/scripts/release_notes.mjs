//@ts-check
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as process from 'process';
import * as semver from 'semver';
import { getCurrentHistorySection, output } from './util.mjs';

const { HIGHLIGHTS = '' } = process.env;
if (HIGHLIGHTS === '') throw new Error('HIGHLIGHTS cannot be empty');

const { highlights } = JSON.parse(HIGHLIGHTS);

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const historyFilePath = path.join(__dirname, '..', '..', 'HISTORY.md');
const packageFilePath = path.join(__dirname, '..', '..', 'package.json');

const historyContents = await fs.readFile(historyFilePath, { encoding: 'utf8' });

const currentHistorySection = getCurrentHistorySection(historyContents);

const version = semver.parse(
  JSON.parse(await fs.readFile(packageFilePath, { encoding: 'utf8' })).version
);
if (version == null) throw new Error(`could not create semver from package.json`);

console.log('\n\n--- history entry ---\n\n', currentHistorySection);

const currentHistorySectionLines = currentHistorySection.split('\n');
const header = currentHistorySectionLines[0];
const history = currentHistorySectionLines.slice(1).join('\n').trim();

const releaseNotes = `${header}

The MongoDB Node.js team is pleased to announce version ${version.version} of the \`mongodb\` package!

${highlights}
${history}
## Documentation

* [Reference](https://docs.mongodb.com/drivers/node/current/)
* [API](https://mongodb.github.io/node-mongodb-native/${version.major}.${version.minor}/)
* [Changelog](https://github.com/mongodb/node-mongodb-native/blob/v${version.version}/HISTORY.md)

We invite you to try the \`mongodb\` library immediately, and report any issues to the [NODE project](https://jira.mongodb.org/projects/NODE).
`;

const releaseNotesPath = path.join(process.cwd(), 'release_notes.md');

await fs.writeFile(
  releaseNotesPath,
  `:seedling: A new release!\n---\n${releaseNotes}\n---\n`,
  { encoding: 'utf8' }
);

await output('release_notes_path', releaseNotesPath)
