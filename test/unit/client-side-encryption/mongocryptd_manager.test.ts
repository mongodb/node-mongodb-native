import { expect } from 'chai';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { MongocryptdManager } from '../../../src/client-side-encryption/mongocryptd_manager';

describe('MongocryptdManager', function () {
  it('should default to having spawnArgs of --idleShutdownTimeoutSecs=60', function () {
    const mcdm = new MongocryptdManager();
    expect(mcdm.spawnArgs).to.deep.equal(['--idleShutdownTimeoutSecs', '60']);
  });

  it('should concat --idleShutdownTimeoutSecs=60 to provided args', function () {
    const mcdm = new MongocryptdManager({ mongocryptdSpawnArgs: ['foo', '12'] });
    expect(mcdm.spawnArgs).to.deep.equal(['foo', '12', '--idleShutdownTimeoutSecs', '60']);
  });

  it('should not override `idleShutdownTimeoutSecs` if the user sets it using `key value` form', function () {
    const mcdm = new MongocryptdManager({
      mongocryptdSpawnArgs: ['--idleShutdownTimeoutSecs', '12']
    });

    expect(mcdm.spawnArgs).to.deep.equal(['--idleShutdownTimeoutSecs', '12']);
  });

  it('does not allow prototype pollution on spawn path', function () {
    const mcdm = new MongocryptdManager({ __proto__: { mongocryptdSpawnPath: 'test' } });
    expect(mcdm.spawnPath).to.equal('');
  });

  it('does not allow prototype pollution on spawn args', function () {
    const mcdm = new MongocryptdManager({ __proto__: { mongocryptdSpawnArgs: 'test' } });
    expect(mcdm.spawnArgs).to.deep.equal(['--idleShutdownTimeoutSecs', '60']);
  });

  it('should not override `idleShutdownTimeoutSecs` if the user sets it using `key=value` form', function () {
    const mcdm = new MongocryptdManager({
      mongocryptdSpawnArgs: ['--idleShutdownTimeoutSecs=12']
    });

    expect(mcdm.spawnArgs).to.deep.equal(['--idleShutdownTimeoutSecs=12']);
  });

  it('should support construction with options', function () {
    const mcdm = new MongocryptdManager({
      mongocryptdURI: 'some-uri',
      mongocryptdBypassSpawn: true,
      mongocryptdSpawnPath: 'some-spawn-path',
      mongocryptdSpawnArgs: ['--idleShutdownTimeoutSecs=12']
    });

    expect(mcdm).to.eql({
      uri: 'some-uri',
      bypassSpawn: true,
      spawnPath: 'some-spawn-path',
      spawnArgs: ['--idleShutdownTimeoutSecs=12']
    });
  });
});
