#! /usr/bin/env ts-node

import { parse, stringify } from '@iarna/toml';
import { exec as execCb } from 'child_process';
import { readFileSync, writeFile as writeFileCb } from 'fs';
import { promisify } from 'util';
import { createInterface } from 'readline';
import { chdir } from 'process';

const exec = promisify(execCb);
const writeFile = promisify(writeFileCb);

const RELEASES_TOML_FILE = './template/data/releases.toml';
const RELEASES_JSON_FILE = './template/static/versions.json';

interface JsonVersionSchema {
  version: string;
}

interface VersionSchema {
  version: string;
  status: string;
  api: string;
  usesMongoDBManual?: boolean;
  docs?: string;
  semverVersion: string;
}

interface TomlVersionSchema {
  current: string;
  mongodDBManual: string;
  versions: VersionSchema[]
}

function prompt(prompt: string) : Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr
  })

  return new Promise((resolve, _) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    })
  })
}

function getCommandLineArguments() : { semverVersion: string, status: string } {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('usage: generate-docs.ts <semver version> <status (optional)>')
    process.exit(1);
  }

  const semverVersion = args.shift();
  const status = args.shift() ?? 'current';
  return {
    semverVersion,
    status
  }
}

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
    tomlData.current = newVersion.version;

    jsonVersions.unshift({ version: newVersion.semverVersion })
  }

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

  const response = await prompt(`
    Generating docs for the following configuration.  
${JSON.stringify(newVersion, null, 2)}
    Does this look right? [y/n] `);

  if (response.trim() !== 'y') {
    console.error("something went wrong.  Exiting...");
    process.exit(1);
  }

  console.error('Installing typedoc...');
  await exec('npm i --no-save typedoc');

  console.error('Successfully installed typedoc.  Building api docs for current branch...');

  await exec('npm run build:typedoc');

  console.error('Successfully built api docs for current branch');

  console.error('Generating new doc site...')
  const tomlVersions = parse(readFileSync(RELEASES_TOML_FILE, { encoding: 'utf8' })) as unknown as TomlVersionSchema;
  const jsonVersions = JSON.parse(readFileSync(RELEASES_JSON_FILE, { encoding: 'utf8' })) as unknown as JsonVersionSchema[];

  const versionAlreadyExists = jsonVersions.some(({version }) => version === semverVersion)

  if (versionAlreadyExists) {
    const response = await prompt(`Version ${semverVersion} already exists.  Do you want to override the existing docs? [y/n] `);
    if (response !== 'y') {
      console.error("something went wrong.  Exiting...");
      process.exit(1);
    }
  }

  await updateSiteTemplateForNewVersion(newVersion, tomlVersions, jsonVersions);

  await copyNewDocsToGeneratedSite(newVersion);

  // copy the generated site to the docs folder
  await exec(`cp -R temp/. ../../docs/.`);

  // cleanup
  await exec('rm -rf temp');

  console.error('Successfully generated api documentation and updated the doc site.')
}

main();
