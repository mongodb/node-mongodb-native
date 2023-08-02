import type { ChildProcess } from 'child_process';

import { type Callback } from '../utils';
import { type AutoEncryptionExtraOptions } from './auto_encrypter';

/**
 * @internal
 * An internal class that handles spawning a mongocryptd.
 */
export class MongocryptdManager {
  static DEFAULT_MONGOCRYPTD_URI = 'mongodb://localhost:27020';

  uri: string;
  bypassSpawn: boolean;
  spawnPath: string;
  spawnArgs: Array<string>;
  _child?: ChildProcess;

  constructor(extraOptions: AutoEncryptionExtraOptions = {}) {
    this.uri =
      typeof extraOptions.mongocryptdURI === 'string' && extraOptions.mongocryptdURI.length > 0
        ? extraOptions.mongocryptdURI
        : MongocryptdManager.DEFAULT_MONGOCRYPTD_URI;

    this.bypassSpawn = !!extraOptions.mongocryptdBypassSpawn;

    this.spawnPath = extraOptions.mongocryptdSpawnPath || '';
    this.spawnArgs = [];
    if (Array.isArray(extraOptions.mongocryptdSpawnArgs)) {
      this.spawnArgs = this.spawnArgs.concat(extraOptions.mongocryptdSpawnArgs);
    }
    if (
      this.spawnArgs
        .filter(arg => typeof arg === 'string')
        .every(arg => arg.indexOf('--idleShutdownTimeoutSecs') < 0)
    ) {
      this.spawnArgs.push('--idleShutdownTimeoutSecs', '60');
    }
  }

  /**
   * Will check to see if a mongocryptd is up. If it is not up, it will attempt
   * to spawn a mongocryptd in a detached process, and then wait for it to be up.
   */
  spawn(callback: Callback<void>) {
    const cmdName = this.spawnPath || 'mongocryptd';

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spawn } = require('child_process') as typeof import('child_process');

    // Spawned with stdio: ignore and detached: true
    // to ensure child can outlive parent.
    this._child = spawn(cmdName, this.spawnArgs, {
      stdio: 'ignore',
      detached: true
    });

    this._child.on('error', () => {
      // From the FLE spec:
      // "The stdout and stderr of the spawned process MUST not be exposed in the driver
      // (e.g. redirect to /dev/null). Users can pass the argument --logpath to
      // extraOptions.mongocryptdSpawnArgs if they need to inspect mongocryptd logs.
      // If spawning is necessary, the driver MUST spawn mongocryptd whenever server
      // selection on the MongoClient to mongocryptd fails. If the MongoClient fails to
      // connect after spawning, the server selection error is propagated to the user."
      // The AutoEncrypter and MongoCryptdManager should work together to spawn
      // mongocryptd whenever necessary.  Additionally, the `mongocryptd` intentionally
      // shuts down after 60s and gets respawned when necessary.  We rely on server
      // selection timeouts when connecting to the `mongocryptd` to inform users that something
      // has been configured incorrectly.  For those reasons, we suppress stderr from
      // the `mongocryptd` process and immediately unref the process.
    });

    // unref child to remove handle from event loop
    this._child.unref();

    process.nextTick(callback);
  }
}
