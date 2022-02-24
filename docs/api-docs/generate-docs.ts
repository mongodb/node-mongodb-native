#! /usr/bin/env ts-node

/**
 * 1. Update the toml file with the new version
 * 2. Update the json file with the new version
 * 3. Generate the site template
 * 4. Copy the contents of history into the generated site
 */

import { parse, stringify } from '@iarna/toml';
import { existsSync, readFileSync, writeFileSync } from 'fs';

import * as child_process from 'child_process';
import { promisify } from 'util';
const exec = promisify(child_process.exec)

const NEW_VERSION = {
    version: 'Driver 4.5',
    version_id: '4.5',
    status: 'latest',
    api: './4.5',
    usesMongoDBManual: true
};

function checkForNewBuild() {
    const pathToBuiltDocs = '../public';
    const docsExist = existsSync(pathToBuiltDocs);

    if (!docsExist) {
        console.error("This script requires that the current API docs already be built.");
        console.error("Please build with npm run build:docs before running this script");
        process.exit(1);
    }
}

async function copyNewDocsToGeneratedSite(newVersion: any) {
    const versionName = newVersion.version_id;
    const outputDirectory = `./site/${versionName}`;
    const pathToBuiltDocs = './temp';
    const command = `cp -R ${pathToBuiltDocs} ${outputDirectory}`
    return await exec(command);
}

function updateTomlFile(newVersion: any) {
    const RELEASES_TOML_FILE = './template/data/releases.toml';

    const contents = readFileSync(RELEASES_TOML_FILE, { encoding: 'utf8' });

    const versions = parse(contents) as {
        [key: string]: any,
        versions: any[]
    }
    versions.versions.unshift(NEW_VERSION)
    writeFileSync(RELEASES_TOML_FILE, stringify(versions))
}

function updateJsonFile(newVersion: any) {
    const RELEASES_JSON_FILE = './template/static/versions.json';
    const versions = JSON.parse(readFileSync(RELEASES_JSON_FILE, { encoding: 'utf8' }))
    versions.unshift({ version: newVersion.version_id });
    writeFileSync(RELEASES_JSON_FILE, JSON.stringify(versions, null, 4))
}

async function generateSiteFromTemplate() {
    const templateDirectory = 'template';
    // output directory is relative to the template directory
    const outputDirectory = '../temp';
    const urlPrefix = '"/node-mongodb-native"';
    const command = `hugo -s ${templateDirectory} -d ${outputDirectory} -b ${urlPrefix}`
    return await exec(command);
}

async function main() {
    await checkForNewBuild();
    updateTomlFile(NEW_VERSION);
    updateJsonFile(NEW_VERSION)
    await generateSiteFromTemplate()
    await copyNewDocsToGeneratedSite(NEW_VERSION);
    await exec(`cp -R temp/. site/.`)
    await exec('rm -rf temp');
}

main()
