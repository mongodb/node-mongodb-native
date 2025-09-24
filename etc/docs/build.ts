#! /usr/bin/env ts-node

import { parse, stringify } from '@iarna/toml';
import { exec as execCb } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { chdir } from 'process';
import { promisify } from 'util';

import {
  confirm,
  customSemverCompare,
  getCommandLineArguments,
  type JsonVersionSchema,
  LATEST_TAG,
  log,
  type TomlVersionSchema,
  type VersionSchema
} from './utils';

const exec = promisify(execCb);

const RELEASES_TOML_FILE = './template/data/releases.toml';
const RELEASES_JSON_FILE = './template/static/versions.json';

const copyGeneratedDocsToDocsFolder = () => exec(`cp -R temp/. ../../docs/.`);
const removeTempDirectory = () => exec('rm -rf temp');
const installDependencies = () => exec('npm i --no-save --legacy-peer-deps typedoc@0.26.7');
const buildDocs = ({ tag }: VersionSchema) => {
  const revision = tag === LATEST_TAG ? 'main' : `v${tag}.0`;
  return exec(`npm run build:typedoc -- --gitRevision ${revision}`);
};

async function copyNewDocsToGeneratedSite({ tag }: VersionSchema) {
  const outputDirectory = `./temp/${tag}`;
  const pathToBuiltDocs = './build';
  const command = `cp -R ${pathToBuiltDocs} ${outputDirectory}`;
  return await exec(command);
}

async function updateSiteTemplateForNewVersion(
  newVersion: VersionSchema,
  tomlData: TomlVersionSchema,
  jsonVersions: JsonVersionSchema[]
) {
  const versionExists = jsonVersions.some(({ version }) => version === newVersion.tag);
  if (versionExists) {
    const existingVersionIndex = tomlData.versions.findIndex(({ tag }) => tag === newVersion.tag);
    tomlData.versions[existingVersionIndex] = newVersion;
  } else {
    for (const version of tomlData.versions) {
      // This new version is going to be the latest, we have to change the previous one to supported
      if (version.status === 'latest') {
        version.status = 'supported';
      }
    }

    tomlData.versions.unshift(newVersion);
    jsonVersions.unshift({ version: newVersion.tag });
  }

  tomlData.versions.sort((a, b) => customSemverCompare(a.tag, b.tag));
  tomlData.current = tomlData.versions.find(
    ({ tag }) => tag.toLowerCase() !== LATEST_TAG.toLowerCase()
  ).version;

  jsonVersions.sort((a, b) => customSemverCompare(a.version, b.version));

  await writeFile(RELEASES_TOML_FILE, stringify(tomlData as any));
  await writeFile(RELEASES_JSON_FILE, JSON.stringify(jsonVersions, null, 4));
  // generate the site from the template
  await exec(`hugo -s template -d ../temp -b "/node-mongodb-native"`);
}

async function main() {
  try {
    await exec('bash ./etc/check-remote.sh');
  } catch (error) {
    console.error(error.stdout);
    process.exit(1);
  }

  const { stdout } = await exec('hugo version', { encoding: 'utf8' });
  if (!stdout.includes('0.150.0')) throw new Error('`hugo` version must be 0.150.0.');

  chdir(__dirname);

  const { tag, status, skipPrompts } = getCommandLineArguments();

  const newVersion: VersionSchema = {
    version: `${tag} Driver`,
    status,
    api: `./${tag}`,
    usesMongoDBManual: true,
    tag
  };

  if (!skipPrompts) {
    await confirm(`
      Generating docs for the following configuration.\n${JSON.stringify(newVersion, null, 2)}
      Does this look right? [y/n] `);
  }

  log('Installing dependencies...');
  await installDependencies();

  log('Building docs for current branch');
  await buildDocs(newVersion);

  log('Generating new static site...');

  const tomlVersions = parse(
    await readFile(RELEASES_TOML_FILE, { encoding: 'utf8' })
  ) as unknown as TomlVersionSchema;
  const jsonVersions = JSON.parse(
    await readFile(RELEASES_JSON_FILE, { encoding: 'utf8' })
  ) as unknown as JsonVersionSchema[];

  const versionAlreadyExists = jsonVersions.some(({ version }) => version === tag);

  if (versionAlreadyExists && !skipPrompts) {
    await confirm(
      `Version ${tag} already exists.  Do you want to override the existing docs? [y/n] `
    );
  }

  await updateSiteTemplateForNewVersion(newVersion, tomlVersions, jsonVersions);
  await copyNewDocsToGeneratedSite(newVersion);
  await copyGeneratedDocsToDocsFolder();
  await removeTempDirectory();

  log('Successfully generated api documentation and updated the doc site.');
}

main();
