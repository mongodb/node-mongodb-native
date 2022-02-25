#! /usr/bin/env ts-node

import { parse, stringify } from '@iarna/toml';
import * as child_process from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

const RELEASES_TOML_FILE = './template/data/releases.toml';
const RELEASES_JSON_FILE = './template/static/versions.json';

interface JsonVersionSchema {
  version: string;
}

interface VersionSchema {
  version: string;
  status: 'current' | 'supported' | 'not-supported';
  api: string;
  usesMongoDBManual?: boolean;
  docs?: string;
  semvarVersion: string;
}
interface TomlVersionSchema {
  current: string;
  mongodDBManual: string;
  versions: VersionSchema[]
}

/**
 * ATTENTION - EDIT THIS BEFORE RELEASING
 */
const NEW_VERSION: VersionSchema = {
  // version - the display name for the version of the driver on the docs website
  //  ex: Driver 4.5
  version: 'Driver 4.5',

  // status - a status for the version.  typically would probably just be 'latest'
  status: 'current',

  // api - the name of the folder for the generated documentation to live.  typically should be version_id prefixed with `./`
  //  ex: ./4.5
  api: './4.5',

  // usesMongoDBManual - if true, includes a link to the mongodb documentation for the new version
  usesMongoDBManual: true,

  // the 
  semvarVersion: '4.5'
};

function validateVersionInformation(jsonVersions: JsonVersionSchema[]) {
  const isVersionInfoValid = ['version', 'version_id', 'status', 'api'].every(
    key => NEW_VERSION[key] !== ''
  );

  if (!isVersionInfoValid) {
    console.error(
      'Error - version information invalid.  Please update the `NEW_VERSION` object before running the script.'
    );
    process.exit(1);
  }

  if (jsonVersions.some(({ version }) => version === NEW_VERSION.semvarVersion)) {
    console.error(
      'Error - attempting to publish docs for a release that already exists.'
    );
    process.exit(1);
  }

}

async function copyNewDocsToGeneratedSite() {
  const outputDirectory = `./temp/${NEW_VERSION.semvarVersion}`;
  const pathToBuiltDocs = './build';
  const command = `cp -R ${pathToBuiltDocs} ${outputDirectory}`;
  return await exec(command);
}

async function updateSiteTemplateForNewVersion(tomlData: TomlVersionSchema, jsonData: JsonVersionSchema[]) {
  tomlData.versions.unshift(NEW_VERSION);
  tomlData.current = NEW_VERSION.version;
  writeFileSync(RELEASES_TOML_FILE, stringify(tomlData as any));

  jsonData.unshift({ version: NEW_VERSION.semvarVersion});
  writeFileSync(RELEASES_JSON_FILE, JSON.stringify(jsonData, null, 4));
  
  // generate the site from the template
  await exec(`hugo -s template -d ../temp -b "/node-mongodb-native"`);
}

async function main() {

  const pathToBuiltDocs = './build';
  const docsExist = existsSync(pathToBuiltDocs);

  if (!docsExist) {
    console.error('This script requires that the current API docs already be built.');
    console.error('Please build with npm run build:docs before running this script');
    process.exit(1);
  }

  const tomlVersions = parse(readFileSync(RELEASES_TOML_FILE, { encoding: 'utf8' })) as unknown as TomlVersionSchema;
  const jsonVersions = JSON.parse(readFileSync(RELEASES_JSON_FILE, { encoding: 'utf8' })) as unknown as JsonVersionSchema[];

  validateVersionInformation(jsonVersions);

  await updateSiteTemplateForNewVersion(tomlVersions, jsonVersions);

  await copyNewDocsToGeneratedSite();

  // copy the generated site to the docs folder
  await exec(`cp -R temp/. ../../docs/.`);

  // cleanup
  await exec('rm -rf temp');
}

main();
