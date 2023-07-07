'use strict';

const spawn = require('child_process').spawn;

/**
 * @ignore
 * An internal class that handles spawning a mongocryptd.
 */
class MongocryptdManager {
  /**
   * @ignore
   * Creates a new Mongocryptd Manager
   * @param {AutoEncrypter~AutoEncryptionExtraOptions} [extraOptions] extra options that determine how/when to spawn a mongocryptd
   */
  constructor(extraOptions) {
    extraOptions = extraOptions || {};

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
      this.spawnArgs.push('--idleShutdownTimeoutSecs', 60);
    }
  }

  /**
   * @ignore
   * Will check to see if a mongocryptd is up. If it is not up, it will attempt
   * to spawn a mongocryptd in a detached process, and then wait for it to be up.
   * @param {Function} callback Invoked when we think a mongocryptd is up
   */
  spawn(callback) {
    const cmdName = this.spawnPath || 'mongocryptd';

    // Spawned with stdio: ignore and detatched:true
    // to ensure child can outlive parent.
    this._child = spawn(cmdName, this.spawnArgs, {
      stdio: 'ignore',
      detached: true
    });

    this._child.on('error', () => {});

    // unref child to remove handle from event loop
    this._child.unref();

    process.nextTick(callback);
  }
}

MongocryptdManager.DEFAULT_MONGOCRYPTD_URI = 'mongodb://localhost:27020';

module.exports = { MongocryptdManager };
