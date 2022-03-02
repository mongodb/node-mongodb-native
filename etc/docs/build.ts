#! /usr/bin/env ts-node

import { parse, stringify } from '@iarna/toml';
import { exec as execCb } from 'child_process';
import { writeFile, readFile } from 'fs/promises';
import { promisify } from 'util';
import { chdir } from 'process';
import { confirm, customSemverCompare, getCommandLineArguments, JsonVersionSchema, TomlVersionSchema, VersionSchema } from './utils';

const exec = promisify(execCb);

const RELEASES_TOML_FILE = './template/data/releases.toml';
const RELEASES_JSON_FILE = './template/static/versions.json';

const copyGeneratedDocsToDocsFolder = () => exec(`cp -R temp/. ../../docs/.`);
const removeTempDirectory = () => exec('rm -rf temp');
const installDependencies = () => exec('npm i --no-save typedoc');
const buildDocs = () => exec('npm run build:typedoc');

async function copyNewDocsToGeneratedSite({ semverVersion }: VersionSchema) {
  const outputDirectory = `./temp/${semverVersion}`;
  const pathToBuiltDocs = './build';
  const command = `cp -R ${pathToBuiltDocs} ${outputDirectory}`;
  return await exec(command);
}

async function updateSiteTemplateForNewVersion(newVersion: VersionSchema, tomlData: TomlVersionSchema, jsonVersions: JsonVersionSchema[]) {
  const versionExists = jsonVersions.some(({ version }) => version === newVersion.semverVersion);
  if (versionExists) {
    const existingVersionIndex = tomlData.versions.findIndex(({ semverVersion }) => semverVersion === newVersion.semverVersion);
    tomlData.versions[existingVersionIndex] = newVersion;
  } else {
    tomlData.versions.unshift(newVersion);

    jsonVersions.unshift({ version: newVersion.semverVersion })
  }

  tomlData.versions.sort((a, b) => customSemverCompare(a.semverVersion, b.semverVersion))
  tomlData.current = tomlData.versions[0].version;

  jsonVersions.sort((a, b) => customSemverCompare(a.version, b.version))

  await writeFile(RELEASES_TOML_FILE, stringify(tomlData as any));
  await writeFile(RELEASES_JSON_FILE, JSON.stringify(jsonVersions, null, 4));

  // generate the site from the template
  await exec(`hugo -s template -d ../temp -b "/node-mongodb-native"`);
}

async function main() {
  chdir(__dirname);

  const { semverVersion, status } = getCommandLineArguments();

  const newVersion: VersionSchema = {
    version: `${semverVersion} Driver`,
    status,
    api: `./${semverVersion}`,
    usesMongoDBManual: true,
    semverVersion
  };

  await confirm(`
    Generating docs for the following configuration.
${JSON.stringify(newVersion, null, 2)}
    Does this look right? [y/n] `
  );

  console.error('Installing dependencies...');
  await installDependencies();

  console.error('Building docs for current branch');
  await buildDocs();

  console.error('Generating new static site...')

  const tomlVersions = parse(await readFile(RELEASES_TOML_FILE, { encoding: 'utf8' })) as unknown as TomlVersionSchema;
  const jsonVersions = JSON.parse(await readFile(RELEASES_JSON_FILE, { encoding: 'utf8' })) as unknown as JsonVersionSchema[];

  const versionAlreadyExists = jsonVersions.some(({ version }) => version === semverVersion)

  if (versionAlreadyExists) {
    await confirm(`Version ${semverVersion} already exists.  Do you want to override the existing docs? [y/n] `);
  }

  await updateSiteTemplateForNewVersion(newVersion, tomlVersions, jsonVersions);
  await copyNewDocsToGeneratedSite(newVersion);
  await copyGeneratedDocsToDocsFolder();
  await removeTempDirectory();

  console.error('Successfully generated api documentation and updated the doc site.')
}

main();
