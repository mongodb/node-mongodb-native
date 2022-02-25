#! /usr/bin/env ts-node

import { parse, stringify } from '@iarna/toml';
import * as child_process from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

/**
 * ATTENTION - EDIT THIS BEFORE RELEASING
 */
const NEW_VERSION = {
  // version - the display name for the version of the driver on the docs website
  //  ex: Driver 4.5
  version: '',

  // version_id - the actual version number of the docs
  //  ex: 4.5
  version_id: '',

  // status - a status for the version.  typically would probably just be 'latest'
  status: '',

  // api - the name of the folder for the generated documentation to live.  typically should be version_id prefixed with `./`
  //  ex: ./4.5
  api: '',

  // usesMongoDBManual - if true, includes a link to the mongodb documentation for the new version
  usesMongoDBManual: true
};

function validateVersionInformation() {
  const isVersionInfoValid = ['version', 'version_id', 'status', 'api'].every(
    key => NEW_VERSION[key] !== ''
  );

  if (!isVersionInfoValid) {
    console.error(
      'Error - version information invalid.  Please update the `NEW_VERSION` object before running the script.'
    );
    process.exit(1);
  }
}

async function copyNewDocsToGeneratedSite({ version_id }) {
  const versionName = version_id;
  const outputDirectory = `./temp/${versionName}`;
  const pathToBuiltDocs = './build';
  const command = `cp -R ${pathToBuiltDocs} ${outputDirectory}`;
  return await exec(command);
}

function updateSiteTemplateForNewVersion(newVersion: any) {
  const RELEASES_TOML_FILE = './template/data/releases.toml';

  const contents = parse(readFileSync(RELEASES_TOML_FILE, { encoding: 'utf8' })) as any;
  contents.versions.unshift(newVersion);
  writeFileSync(RELEASES_TOML_FILE, stringify(contents));

  const RELEASES_JSON_FILE = './template/static/versions.json';

  const versions = JSON.parse(readFileSync(RELEASES_JSON_FILE, { encoding: 'utf8' }));
  versions.unshift({ version: newVersion.version_id });
  writeFileSync(RELEASES_JSON_FILE, JSON.stringify(versions, null, 4));
}

async function main() {
  validateVersionInformation();

  const pathToBuiltDocs = './build';
  const docsExist = existsSync(pathToBuiltDocs);

  if (!docsExist) {
    console.error('This script requires that the current API docs already be built.');
    console.error('Please build with npm run build:docs before running this script');
    process.exit(1);
  }

  updateSiteTemplateForNewVersion(NEW_VERSION);

  // generate the site from the template
  await exec(`hugo -s template -d ../temp -b "/node-mongodb-native"`);
  await copyNewDocsToGeneratedSite(NEW_VERSION);

  // copy the generated site to the docs folder
  await exec(`cp -R temp/. ../docs/.`);

  // cleanup
  await exec('rm -rf temp');
}

main();
