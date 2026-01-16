// @ts-check
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as process from 'process';
import * as child_process from 'node:child_process';
import * as util from 'node:util';
import { output } from './util.mjs';
const exec = util.promisify(child_process.exec);

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const pkgFilePath = path.join(__dirname, '..', '..', 'package.json');

process.env.TZ = 'Etc/UTC';

/** @param {boolean} publish */
async function shouldPublish(publish) {
  const answer = publish ? 'yes' : 'no';
  await output('publish', answer);
}

/**
 * FORMAT : M.M.P-dev.YYYYMMDD.sha.##########
 * EXAMPLE: 5.6.0-dev.20230601.sha.0853c6957c
 */
class NightlyVersion {
  /** @param {string} version */
  constructor(version) {
    /** @type {string} */
    this.version = version;
    const [, meta] = this.version.split('dev.');
    const [dateString, commit] = meta.split('.sha.');
    /** @type {string} */
    this.commit = commit;
    /** @type {string} */
    this.dateString = dateString;
  }
  static async currentNightlyVersion() {
    const { stdout } = await exec('npm show --json mongodb', { encoding: 'utf8' });
    /** @type {{'dist-tags': {nightly?: string} }} */
    const showInfo = JSON.parse(stdout);
    const version = showInfo?.['dist-tags']?.nightly ?? '0.0.0-dev.YYYYMMDD.sha.##########';
    return new NightlyVersion(version);
  }
  static async currentCommit() {
    const { stdout } = await exec('git rev-parse --short HEAD', { encoding: 'utf8' });
    return stdout.trim();
  }
  static async generateNightlyVersion() {
    console.log('Generating new nightly version');
    const currentCommit = await NightlyVersion.currentCommit();
    const today = new Date();
    const year = `${today.getUTCFullYear()}`;
    const month = `${today.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${today.getUTCDate()}`.padStart(2, '0');
    const yyyymmdd = `${year}${month}${day}`;

    const pkg = JSON.parse(await fs.readFile(pkgFilePath, { encoding: 'utf8' }));

    console.log('package.json version is:', pkg.version);
    pkg.version = `${pkg.version}-dev.${yyyymmdd}.sha.${currentCommit}`;
    console.log('package.json version updated to:', pkg.version);

    await fs.writeFile(pkgFilePath, JSON.stringify(pkg, undefined, 2), { encoding: 'utf8' });
    console.log('wrote package.json');
  }
}

const currentPublishedNightly = await NightlyVersion.currentNightlyVersion();
console.log('current published nightly:', currentPublishedNightly?.version);
const currentCommit = await NightlyVersion.currentCommit();
console.log('current commit sha:', currentCommit);

if (currentPublishedNightly.commit === currentCommit) {
  console.log('Published nightly is up to date, nothing to do');
  await shouldPublish(false);
} else {
  await NightlyVersion.generateNightlyVersion();
  console.log('Published nightly is behind main, updated package.json');
  await shouldPublish(true);
}

console.log('done.');
