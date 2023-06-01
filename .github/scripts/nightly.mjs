// @ts-check
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as process from 'node:process';
import * as child_process from 'node:child_process';
import * as util from 'node:util';
const exec = util.promisify(child_process.exec);

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const pkgFilePath = path.join(__dirname, '..', '..', 'package.json');

process.env.TZ = 'Etc/UTC';

/**
 * FORMAT : M.M.P-dev+YYYYMMDD.sha.##########
 * EXAMPLE: 5.6.0-dev+20230601.sha.0853c6957c
 */
class NightlyVersion {
  constructor(version) {
    /** @type {string} */
    this.version = version;
    const [, meta] = this.version.split('+');
    const [dateString, commit] = meta.split('.sha.');
    /** @type {string} */
    this.commit = commit;
    /** @type {string} */
    this.dateString = dateString;
  }
  get date() {
    const date = new Date();
    date.setFullYear(Number(this.dateString.slice(0, 4)));
    date.setMonth(Number(this.dateString.slice(4, 6)));
    date.setDate(Number(this.dateString.slice(6, 8)));
    return date;
  }
  static async currentNightlyVersion() {
    try {
      const { stdout } = await exec('npm show --json mongodb@nightly', { encoding: 'utf8' });
      /** @type {{'dist-tags': {nightly?: string} }} */
      const showInfo = JSON.parse(stdout);
      return new NightlyVersion(showInfo['dist-tags'].nightly) ?? null;
    } catch (error) {
      return null;
    }
  }
  static async currentCommit() {
    const { stdout: currentCommit } = await exec('git rev-parse --short HEAD', {
      encoding: 'utf8'
    });
    return currentCommit.trim();
  }
  static async generateNightlyVersion() {
    console.log('Generating new nightly version');
    const currentCommit = await NightlyVersion.currentCommit();
    const today = new Date();
    const year = `${today.getFullYear()}`;
    const month = `${today.getMonth()}`.padStart(2, '0');
    const day = `${today.getUTCDate()}`.padStart(2, '0');
    const yyyymmdd = `${year}${month}${day}`;

    const pkg = JSON.parse(await fs.readFile(pkgFilePath, { encoding: 'utf8' }));

    console.log('package.json version is:', pkg.version);
    pkg.version = `${pkg.version}-dev+${yyyymmdd}.sha.${currentCommit}`;
    console.log('package.json version updated to:', pkg.version);

    await fs.writeFile(pkgFilePath, JSON.stringify(pkg, undefined, 2), { encoding: 'utf8' });
  }
}

const currentPublishedNightly = await NightlyVersion.currentNightlyVersion();
console.log('current published nightly:', currentPublishedNightly?.version);
const currentCommit = await NightlyVersion.currentCommit();
console.log('current commit sha:', currentCommit);

if (currentPublishedNightly?.commit === currentCommit) {
  console.log('Published nightly is up to date');
  process.exit(1);
}
await NightlyVersion.generateNightlyVersion();
process.exit(0);
