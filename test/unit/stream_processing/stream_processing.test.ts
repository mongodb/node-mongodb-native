import * as fs from 'fs';
import * as path from 'path';

import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  Aspect,
  CreateStreamProcessorOperation,
  DropStreamProcessorOperation,
  GetMoreSampleStreamProcessorOperation,
  GetStreamProcessorOperation,
  GetStreamProcessorStatsOperation,
  MongoInvalidArgumentError,
  MongoParseError,
  MongoServerError,
  SampleCursor,
  StartSampleStreamProcessorOperation,
  StartStreamProcessorOperation,
  StopStreamProcessorOperation,
  StreamProcessingClient,
  StreamProcessor,
  StreamProcessors
} from '../../mongodb';
import * as executeOperationModule from '../../../src/operations/execute_operation';
import { isWorkspaceEndpoint } from '../../../src/stream_processing/stream_processing_client';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build a minimal StreamProcessingClient without opening any sockets. */
function makeClient(url = 'mongodb://localhost:27017/', opts = {}) {
  return new StreamProcessingClient(url, opts);
}

/** Build StreamProcessors backed by a fake client. */
function makeStreamProcessors(url = 'mongodb://localhost:27017/') {
  return makeClient(url).streamProcessors();
}

// ---------------------------------------------------------------------------
// StreamProcessingClient construction
// ---------------------------------------------------------------------------

describe('StreamProcessingClient construction', function () {
  it('rejects mongodb+srv:// URI', function () {
    expect(() => makeClient('mongodb+srv://host/db')).to.throw(
      MongoParseError,
      /mongodb\+srv/
    );
  });

  it('rejects tls: false option', function () {
    expect(() => makeClient('mongodb://localhost/', { tls: false })).to.throw(
      MongoParseError,
      /TLS cannot be disabled/
    );
  });

  it('rejects ssl: false option', function () {
    expect(() => makeClient('mongodb://localhost/', { ssl: false })).to.throw(
      MongoParseError,
      /TLS cannot be disabled/
    );
  });

  it('rejects ?tls=false in URI query string', function () {
    expect(() => makeClient('mongodb://localhost/?tls=false')).to.throw(
      MongoParseError,
      /TLS cannot be disabled/
    );
  });

  it('rejects ?ssl=false in URI query string', function () {
    expect(() => makeClient('mongodb://localhost/?ssl=false')).to.throw(
      MongoParseError,
      /TLS cannot be disabled/
    );
  });

  it('forces tls: true on the underlying MongoClient', function () {
    const client = makeClient('mongodb://localhost/');
    expect(client._mongoClient.options).to.have.property('tls', true);
  });

  it('defaults authSource to admin when not set in URI or options', function () {
    // authSource ends up in credentials.source after MongoClient parses options;
    // credentials are only created when auth is present, so we must pass auth.
    const client = makeClient('mongodb://localhost/', { auth: { username: 'u', password: 'p' } });
    expect(client._mongoClient.options.credentials?.source).to.equal('admin');
  });

  it('preserves explicit authSource from options', function () {
    const client = makeClient('mongodb://localhost/', {
      auth: { username: 'u', password: 'p' },
      authSource: 'mydb'
    });
    expect(client._mongoClient.options.credentials?.source).to.equal('mydb');
  });

  it('preserves explicit authSource from URI query string', function () {
    const client = makeClient('mongodb://u:p@localhost/?authSource=mydb');
    expect(client._mongoClient.options.credentials?.source).to.equal('mydb');
  });

  it('drops the ssl option so it does not shadow tls', function () {
    // ssl is deleted from mergedOptions before passing to MongoClient
    // so the internal options should only show tls: true, not ssl
    const client = makeClient('mongodb://localhost/');
    expect(client._mongoClient.options).not.to.have.property('ssl');
    expect(client._mongoClient.options).to.have.property('tls', true);
  });
});

// ---------------------------------------------------------------------------
// isWorkspaceEndpoint
// ---------------------------------------------------------------------------

describe('isWorkspaceEndpoint', function () {
  it('returns true for atlas-stream- prefix', function () {
    expect(isWorkspaceEndpoint('atlas-stream-foo.virginia-usa.a.query.mongodb.net')).to.be.true;
  });

  it('returns true for .a.query.mongodb.net suffix', function () {
    expect(isWorkspaceEndpoint('something.a.query.mongodb.net')).to.be.true;
  });

  it('returns false for a normal Atlas cluster hostname', function () {
    expect(isWorkspaceEndpoint('cluster0.mongodb.net')).to.be.false;
  });

  it('returns false for localhost', function () {
    expect(isWorkspaceEndpoint('localhost')).to.be.false;
  });
});

// ---------------------------------------------------------------------------
// Operation command documents & aspects
// ---------------------------------------------------------------------------

describe('Operation command documents', function () {
  const conn = undefined as any;

  describe('CreateStreamProcessorOperation', function () {
    it('builds minimal command with no options', function () {
      const op = new CreateStreamProcessorOperation('sp1', [{ $source: {} }]);
      const cmd = op.buildCommandDocument(conn);
      expect(cmd).to.deep.equal({ createStreamProcessor: 'sp1', pipeline: [{ $source: {} }] });
    });

    it('includes options sub-doc when aspOptions are given', function () {
      const op = new CreateStreamProcessorOperation('sp1', [{ $source: {} }], {
        tier: 'SP10',
        streamMetaFieldName: '__stream',
        failover: true
      });
      const cmd = op.buildCommandDocument(conn);
      expect(cmd).to.have.property('options');
      expect(cmd.options).to.deep.include({ tier: 'SP10', streamMetaFieldName: '__stream', failover: true });
    });

    it('omits options key when aspOptions object is empty after filtering', function () {
      const op = new CreateStreamProcessorOperation('sp1', [{ $source: {} }], {});
      const cmd = op.buildCommandDocument(conn);
      expect(cmd).not.to.have.property('options');
    });

    it('is a WRITE operation, not retryable read', function () {
      const op = new CreateStreamProcessorOperation('sp1', [{ $source: {} }]);
      expect(op.hasAspect(Aspect.WRITE_OPERATION)).to.be.true;
      expect(op.canRetryRead).to.be.false;
    });
  });

  describe('DropStreamProcessorOperation', function () {
    it('builds correct command', function () {
      const op = new DropStreamProcessorOperation('sp1');
      expect(op.buildCommandDocument(conn)).to.deep.equal({ dropStreamProcessor: 'sp1' });
    });

    it('is a WRITE operation', function () {
      const op = new DropStreamProcessorOperation('sp1');
      expect(op.hasAspect(Aspect.WRITE_OPERATION)).to.be.true;
    });
  });

  describe('StopStreamProcessorOperation', function () {
    it('builds correct command', function () {
      const op = new StopStreamProcessorOperation('sp1');
      expect(op.buildCommandDocument(conn)).to.deep.equal({ stopStreamProcessor: 'sp1' });
    });

    it('is a WRITE operation', function () {
      const op = new StopStreamProcessorOperation('sp1');
      expect(op.hasAspect(Aspect.WRITE_OPERATION)).to.be.true;
    });
  });

  describe('GetStreamProcessorOperation', function () {
    it('builds correct command', function () {
      const op = new GetStreamProcessorOperation('sp1');
      expect(op.buildCommandDocument(conn)).to.deep.equal({ getStreamProcessor: 'sp1' });
    });

    it('is a retryable READ operation', function () {
      const op = new GetStreamProcessorOperation('sp1');
      expect(op.hasAspect(Aspect.READ_OPERATION)).to.be.true;
      expect(op.hasAspect(Aspect.RETRYABLE)).to.be.true;
      expect(op.canRetryRead).to.be.true;
    });
  });

  describe('GetStreamProcessorStatsOperation', function () {
    it('builds minimal command with no options', function () {
      const op = new GetStreamProcessorStatsOperation('sp1');
      expect(op.buildCommandDocument(conn)).to.deep.equal({ getStreamProcessorStats: 'sp1' });
    });

    it('includes scale when provided', function () {
      const op = new GetStreamProcessorStatsOperation('sp1', { scale: 1024 });
      const cmd = op.buildCommandDocument(conn);
      expect(cmd).to.have.property('scale', 1024);
    });

    it('includes verbose when provided', function () {
      const op = new GetStreamProcessorStatsOperation('sp1', { verbose: true });
      const cmd = op.buildCommandDocument(conn);
      expect(cmd).to.have.property('verbose', true);
    });

    it('is a retryable READ operation', function () {
      const op = new GetStreamProcessorStatsOperation('sp1');
      expect(op.hasAspect(Aspect.READ_OPERATION)).to.be.true;
      expect(op.hasAspect(Aspect.RETRYABLE)).to.be.true;
      expect(op.canRetryRead).to.be.true;
    });
  });

  describe('StartStreamProcessorOperation', function () {
    it('builds minimal command with no options', function () {
      const op = new StartStreamProcessorOperation('sp1');
      expect(op.buildCommandDocument(conn)).to.deep.equal({ startStreamProcessor: 'sp1' });
    });

    it('places workers at the top level', function () {
      const op = new StartStreamProcessorOperation('sp1', { workers: 3 });
      const cmd = op.buildCommandDocument(conn);
      expect(cmd).to.have.property('workers', 3);
      expect(cmd).not.to.have.nested.property('options.workers');
    });

    it('places clearCheckpoints, tier, enableAutoScaling, failover inside options sub-doc', function () {
      const op = new StartStreamProcessorOperation('sp1', {
        clearCheckpoints: true,
        tier: 'SP30',
        enableAutoScaling: false,
        failover: { enabled: true }
      });
      const cmd = op.buildCommandDocument(conn);
      expect(cmd).to.have.property('options');
      expect(cmd.options).to.deep.include({
        clearCheckpoints: true,
        tier: 'SP30',
        enableAutoScaling: false,
        failover: { enabled: true }
      });
    });

    it('omits options sub-doc when none of the nested opts are given', function () {
      const op = new StartStreamProcessorOperation('sp1', { workers: 2 });
      const cmd = op.buildCommandDocument(conn);
      expect(cmd).not.to.have.property('options');
    });

    it('is a WRITE operation', function () {
      const op = new StartStreamProcessorOperation('sp1');
      expect(op.hasAspect(Aspect.WRITE_OPERATION)).to.be.true;
    });
  });

  describe('StartSampleStreamProcessorOperation', function () {
    it('builds minimal command with no limit', function () {
      const op = new StartSampleStreamProcessorOperation('sp1');
      expect(op.buildCommandDocument(conn)).to.deep.equal({ startSampleStreamProcessor: 'sp1' });
    });

    it('includes limit when provided', function () {
      const op = new StartSampleStreamProcessorOperation('sp1', 10);
      const cmd = op.buildCommandDocument(conn);
      expect(cmd).to.have.property('limit', 10);
    });

    it('is a WRITE operation', function () {
      const op = new StartSampleStreamProcessorOperation('sp1');
      expect(op.hasAspect(Aspect.WRITE_OPERATION)).to.be.true;
    });
  });

  describe('GetMoreSampleStreamProcessorOperation', function () {
    it('builds command with cursorId', function () {
      const op = new GetMoreSampleStreamProcessorOperation('sp1', 42);
      const cmd = op.buildCommandDocument(conn);
      expect(cmd).to.have.property('getMoreSampleStreamProcessor', 'sp1');
      expect(cmd).to.have.property('cursorId', 42);
    });

    it('includes batchSize when provided', function () {
      const op = new GetMoreSampleStreamProcessorOperation('sp1', 42, 5);
      const cmd = op.buildCommandDocument(conn);
      expect(cmd).to.have.property('batchSize', 5);
    });

    it('omits batchSize when not provided', function () {
      const op = new GetMoreSampleStreamProcessorOperation('sp1', 42);
      expect(op.buildCommandDocument(conn)).not.to.have.property('batchSize');
    });

    it('is a WRITE operation', function () {
      const op = new GetMoreSampleStreamProcessorOperation('sp1', 42);
      expect(op.hasAspect(Aspect.WRITE_OPERATION)).to.be.true;
    });
  });
});

// ---------------------------------------------------------------------------
// StreamProcessors (stub executeOperation)
// ---------------------------------------------------------------------------

describe('StreamProcessors', function () {
  let executeStub: sinon.SinonStub;
  let sps: StreamProcessors;

  beforeEach(function () {
    executeStub = sinon.stub(executeOperationModule, 'executeOperation');
    sps = makeStreamProcessors();
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('create()', function () {
    it('sends createStreamProcessor command', async function () {
      executeStub.resolves({});
      await sps.create('sp1', [{ $source: {} }]);
      expect(executeStub.calledOnce).to.be.true;
      const op: CreateStreamProcessorOperation = executeStub.firstCall.args[1];
      expect(op).to.be.instanceOf(CreateStreamProcessorOperation);
      expect(op.processorName).to.equal('sp1');
      expect(op.pipeline).to.deep.equal([{ $source: {} }]);
    });

    it('rejects empty processor name before wire call', async function () {
      const err = await sps.create('', [{ $source: {} }]).catch(e => e);
      expect(err).to.be.instanceOf(MongoInvalidArgumentError);
      expect(err.message).to.match(/non-empty/);
      expect(executeStub.called).to.be.false;
    });

    it('rejects whitespace-only processor name before wire call', async function () {
      const err = await sps.create('   ', [{ $source: {} }]).catch(e => e);
      expect(err).to.be.instanceOf(MongoInvalidArgumentError);
      expect(executeStub.called).to.be.false;
    });

    it('rejects empty pipeline before wire call', async function () {
      const err = await sps.create('sp1', []).catch(e => e);
      expect(err).to.be.instanceOf(MongoInvalidArgumentError);
      expect(err.message).to.match(/non-empty pipeline/);
      expect(executeStub.called).to.be.false;
    });
  });

  describe('get()', function () {
    it('returns a StreamProcessor handle without making a wire call', function () {
      const proc = sps.get('sp1');
      expect(proc).to.be.instanceOf(StreamProcessor);
      expect(proc.name).to.equal('sp1');
      expect(executeStub.called).to.be.false;
    });

    it('rejects empty name', function () {
      expect(() => sps.get('')).to.throw(MongoInvalidArgumentError, /non-empty/);
    });
  });

  describe('getInfo()', function () {
    it('sends getStreamProcessor command', async function () {
      executeStub.resolves({ name: 'sp1', state: 'CREATED', pipeline: [] });
      await sps.getInfo('sp1');
      const op: GetStreamProcessorOperation = executeStub.firstCall.args[1];
      expect(op).to.be.instanceOf(GetStreamProcessorOperation);
      expect(op.processorName).to.equal('sp1');
    });

    it('unwraps the { ok, result } envelope from dev server', async function () {
      const inner = { name: 'sp1', state: 'STARTED', pipeline: [{ $source: {} }], pipelineVersion: 2, unknownField: 'kept' };
      executeStub.resolves({ ok: 1, result: inner });
      const info = await sps.getInfo('sp1');
      expect(info.state).to.equal('STARTED');
      expect(info.pipelineVersion).to.equal(2);
    });

    it('handles a flat response from Atlas (no result envelope)', async function () {
      const flat = { name: 'sp1', state: 'STOPPED', pipeline: [], hasStarted: true };
      executeStub.resolves(flat);
      const info = await sps.getInfo('sp1');
      expect(info.state).to.equal('STOPPED');
      expect(info.hasStarted).to.be.true;
    });

    it('preserves unknown fields on .raw', async function () {
      const doc = { name: 'sp1', state: 'CREATED', pipeline: [], brandNewField: 'future' };
      executeStub.resolves(doc);
      const info = await sps.getInfo('sp1');
      expect(info.raw).to.have.property('brandNewField', 'future');
    });

    it('works when id and pipelineVersion are absent', async function () {
      executeStub.resolves({ name: 'sp1', state: 'CREATED', pipeline: [] });
      const info = await sps.getInfo('sp1');
      expect(info.id).to.be.undefined;
      expect(info.pipelineVersion).to.be.undefined;
    });

    it('returns an unknown state string as-is (not enumerated)', async function () {
      executeStub.resolves({ name: 'sp1', state: 'SOME_FUTURE_STATE', pipeline: [] });
      const info = await sps.getInfo('sp1');
      expect(info.state).to.equal('SOME_FUTURE_STATE');
    });

    it('defaults pipeline to [] when absent from server response', async function () {
      executeStub.resolves({ name: 'sp1', state: 'CREATED' });
      const info = await sps.getInfo('sp1');
      expect(info.pipeline).to.deep.equal([]);
    });
  });
});

// ---------------------------------------------------------------------------
// StreamProcessor lifecycle (stub executeOperation)
// ---------------------------------------------------------------------------

describe('StreamProcessor lifecycle', function () {
  let executeStub: sinon.SinonStub;
  let proc: StreamProcessor;

  beforeEach(function () {
    executeStub = sinon.stub(executeOperationModule, 'executeOperation');
    proc = makeStreamProcessors().get('sp1');
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('start()', function () {
    it('sends startStreamProcessor command', async function () {
      executeStub.resolves({});
      await proc.start();
      const op: StartStreamProcessorOperation = executeStub.firstCall.args[1];
      expect(op).to.be.instanceOf(StartStreamProcessorOperation);
      expect(op.processorName).to.equal('sp1');
    });

    it('rejects startAfter + startAtOperationTime together before wire call', async function () {
      const err = await proc.start({ startAfter: {}, startAtOperationTime: { t: 1, i: 0 } as any }).catch(e => e);
      expect(err).to.be.instanceOf(MongoInvalidArgumentError);
      expect(err.message).to.match(/mutually exclusive/);
      expect(executeStub.called).to.be.false;
    });

    it('rejects an invalid tier before wire call', async function () {
      const err = await proc.start({ tier: 'SP999' as any }).catch(e => e);
      expect(err).to.be.instanceOf(MongoInvalidArgumentError);
      expect(err.message).to.match(/Invalid tier/);
      expect(executeStub.called).to.be.false;
    });

    it('rejects workers <= 0 before wire call', async function () {
      const err = await proc.start({ workers: 0 }).catch(e => e);
      expect(err).to.be.instanceOf(MongoInvalidArgumentError);
      expect(err.message).to.match(/workers/);
      expect(executeStub.called).to.be.false;
    });
  });

  describe('stop()', function () {
    it('sends stopStreamProcessor command', async function () {
      executeStub.resolves({});
      await proc.stop();
      const op: StopStreamProcessorOperation = executeStub.firstCall.args[1];
      expect(op).to.be.instanceOf(StopStreamProcessorOperation);
      expect(op.processorName).to.equal('sp1');
    });
  });

  describe('drop()', function () {
    it('sends dropStreamProcessor command', async function () {
      executeStub.resolves({});
      await proc.drop();
      const op: DropStreamProcessorOperation = executeStub.firstCall.args[1];
      expect(op).to.be.instanceOf(DropStreamProcessorOperation);
      expect(op.processorName).to.equal('sp1');
    });
  });

  describe('stats()', function () {
    it('sends getStreamProcessorStats command', async function () {
      executeStub.resolves({ bytesIn: 100 });
      await proc.stats();
      const op: GetStreamProcessorStatsOperation = executeStub.firstCall.args[1];
      expect(op).to.be.instanceOf(GetStreamProcessorStatsOperation);
      expect(op.processorName).to.equal('sp1');
    });

    it('returns the raw response preserving unknown fields', async function () {
      const raw = { bytesIn: 100, futureField: 'x' };
      executeStub.resolves(raw);
      const result = await proc.stats();
      expect(result).to.deep.equal(raw);
    });

    it('rejects scale <= 0 before wire call', async function () {
      const err = await proc.stats({ scale: 0 }).catch(e => e);
      expect(err).to.be.instanceOf(MongoInvalidArgumentError);
      expect(err.message).to.match(/scale/);
      expect(executeStub.called).to.be.false;
    });
  });

  describe('getStreamProcessorSamples()', function () {
    it('sends startSampleStreamProcessor when no cursorId given', async function () {
      executeStub.resolves({ cursorId: 1, messages: [] });
      await proc.getStreamProcessorSamples();
      const op: StartSampleStreamProcessorOperation = executeStub.firstCall.args[1];
      expect(op).to.be.instanceOf(StartSampleStreamProcessorOperation);
    });

    it('sends getMoreSampleStreamProcessor when cursorId is present', async function () {
      executeStub.resolves({ cursorId: 0, messages: [] });
      await proc.getStreamProcessorSamples({ cursorId: 42 });
      const op: GetMoreSampleStreamProcessorOperation = executeStub.firstCall.args[1];
      expect(op).to.be.instanceOf(GetMoreSampleStreamProcessorOperation);
    });

    it('rejects cursorId of 0 (exhausted) before wire call', async function () {
      const err = await proc.getStreamProcessorSamples({ cursorId: 0 }).catch(e => e);
      expect(err).to.be.instanceOf(MongoInvalidArgumentError);
      expect(err.message).to.match(/exhausted/);
      expect(executeStub.called).to.be.false;
    });

    it('rejects negative cursorId before wire call', async function () {
      const err = await proc.getStreamProcessorSamples({ cursorId: -1 }).catch(e => e);
      expect(err).to.be.instanceOf(MongoInvalidArgumentError);
      expect(err.message).to.match(/non-negative/);
      expect(executeStub.called).to.be.false;
    });

    it('handles messages shape (Atlas real server)', async function () {
      const docs = [{ a: 1 }, { a: 2 }];
      executeStub.resolves({ cursorId: 0, messages: docs });
      const result = await proc.getStreamProcessorSamples();
      expect(result.documents).to.deep.equal(docs);
    });

    it('handles firstBatch shape (spec)', async function () {
      const docs = [{ b: 1 }];
      executeStub.resolves({ cursorId: 0, firstBatch: docs });
      const result = await proc.getStreamProcessorSamples();
      expect(result.documents).to.deep.equal(docs);
    });

    it('handles nextBatch shape (dev server continuation)', async function () {
      const docs = [{ c: 1 }];
      executeStub.resolves({ cursorId: 0, nextBatch: docs });
      const result = await proc.getStreamProcessorSamples({ cursorId: 99 });
      expect(result.documents).to.deep.equal(docs);
    });

    it('normalises bigint cursorId to number in result', async function () {
      executeStub.resolves({ cursorId: BigInt(7), messages: [] });
      const result = await proc.getStreamProcessorSamples();
      expect(result.cursorId).to.equal(BigInt(7));
    });

    it('defaults documents to [] when batch key is absent', async function () {
      executeStub.resolves({ cursorId: 0 });
      const result = await proc.getStreamProcessorSamples();
      expect(result.documents).to.deep.equal([]);
    });
  });
});

// ---------------------------------------------------------------------------
// SampleCursor
// ---------------------------------------------------------------------------

describe('SampleCursor', function () {
  let getSampleStub: sinon.SinonStub;
  let fakeProc: StreamProcessor;

  beforeEach(function () {
    fakeProc = makeStreamProcessors().get('sp1');
    getSampleStub = sinon.stub(fakeProc, 'getStreamProcessorSamples');
  });

  afterEach(function () {
    sinon.restore();
  });

  it('does not extend AbstractCursor or any other base class', function () {
    expect(Object.getPrototypeOf(SampleCursor.prototype)).to.equal(Object.prototype);
  });

  it('starts with cursorId null, alive true', function () {
    const cursor = new SampleCursor(fakeProc);
    expect(cursor.cursorId).to.be.null;
    expect(cursor.alive).to.be.true;
  });

  it('close() sets alive to false', async function () {
    const cursor = new SampleCursor(fakeProc);
    await cursor.close();
    expect(cursor.alive).to.be.false;
  });

  it('cursorId goes null → N → 0 across lifecycle', async function () {
    getSampleStub.onFirstCall().resolves({ cursorId: 5, documents: [{ x: 1 }] });
    getSampleStub.onSecondCall().resolves({ cursorId: 0, documents: [] });

    const cursor = new SampleCursor(fakeProc);
    expect(cursor.cursorId).to.be.null;

    const iter = cursor[Symbol.asyncIterator]();
    await iter.next(); // drains doc from first batch
    expect(cursor.cursorId).to.equal(5);

    await iter.next(); // triggers refill → cursorId 0
    expect(Number(cursor.cursorId)).to.equal(0);
    expect(cursor.alive).to.be.false;
  });

  it('drains a single batch and stops', async function () {
    getSampleStub.resolves({ cursorId: 0, documents: [{ a: 1 }, { a: 2 }] });

    const docs: unknown[] = [];
    for await (const doc of new SampleCursor(fakeProc)) {
      docs.push(doc);
    }
    expect(docs).to.deep.equal([{ a: 1 }, { a: 2 }]);
    expect(getSampleStub.calledOnce).to.be.true;
  });

  it('drains multiple batches (3 calls, last returns cursorId 0)', async function () {
    getSampleStub.onFirstCall().resolves({ cursorId: 1, documents: [{ n: 1 }] });
    getSampleStub.onSecondCall().resolves({ cursorId: 2, documents: [{ n: 2 }] });
    getSampleStub.onThirdCall().resolves({ cursorId: 0, documents: [{ n: 3 }] });

    const docs: unknown[] = [];
    for await (const doc of new SampleCursor(fakeProc)) {
      docs.push(doc);
    }
    expect(docs).to.deep.equal([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(getSampleStub.calledThrice).to.be.true;
  });

  it('continues polling on empty batch with non-zero cursorId', async function () {
    getSampleStub.onFirstCall().resolves({ cursorId: 9, documents: [] });
    getSampleStub.onSecondCall().resolves({ cursorId: 0, documents: [{ z: 1 }] });

    const docs: unknown[] = [];
    for await (const doc of new SampleCursor(fakeProc)) {
      docs.push(doc);
    }
    expect(docs).to.deep.equal([{ z: 1 }]);
    expect(getSampleStub.calledTwice).to.be.true;
  });

  it('makes no extra wire call after cursorId 0', async function () {
    getSampleStub.resolves({ cursorId: 0, documents: [{ a: 1 }] });

    const docs: unknown[] = [];
    for await (const doc of new SampleCursor(fakeProc)) {
      docs.push(doc);
    }
    expect(getSampleStub.calledOnce).to.be.true;
  });

  it('stops iteration when close() is called mid-stream', async function () {
    getSampleStub.onFirstCall().resolves({ cursorId: 1, documents: [{ a: 1 }, { a: 2 }, { a: 3 }] });

    const cursor = new SampleCursor(fakeProc);
    const docs: unknown[] = [];
    for await (const doc of cursor) {
      docs.push(doc);
      if (docs.length === 1) await cursor.close();
    }
    expect(docs).to.have.lengthOf(1);
    expect(cursor.alive).to.be.false;
  });

  it('passes limit to the initial call', async function () {
    getSampleStub.resolves({ cursorId: 0, documents: [] });
    const cursor = new SampleCursor(fakeProc, 7);
    for await (const _ of cursor) { /* drain */ }
    expect(getSampleStub.firstCall.args[0]).to.deep.include({ limit: 7 });
    expect(getSampleStub.firstCall.args[0]).not.to.have.property('cursorId');
  });

  it('passes batchSize to continuation calls', async function () {
    getSampleStub.onFirstCall().resolves({ cursorId: 3, documents: [{ a: 1 }] });
    getSampleStub.onSecondCall().resolves({ cursorId: 0, documents: [] });

    const cursor = new SampleCursor(fakeProc, undefined, 20);
    for await (const _ of cursor) { /* drain */ }

    const secondCallArg = getSampleStub.secondCall.args[0];
    expect(secondCallArg).to.have.property('batchSize', 20);
    expect(secondCallArg).to.have.property('cursorId', 3);
    expect(secondCallArg).not.to.have.property('limit');
  });
});

// ---------------------------------------------------------------------------
// Error propagation
// ---------------------------------------------------------------------------

describe('Error propagation', function () {
  let executeStub: sinon.SinonStub;
  let proc: StreamProcessor;
  let sps: StreamProcessors;

  beforeEach(function () {
    executeStub = sinon.stub(executeOperationModule, 'executeOperation');
    sps = makeStreamProcessors();
    proc = sps.get('sp1');
  });

  afterEach(function () {
    sinon.restore();
  });

  const serverError = new MongoServerError({ message: 'boom', code: 125 });

  for (const [label, action] of [
    ['create()', () => sps.create('sp1', [{ $source: {} }])],
    ['getInfo()', () => sps.getInfo('sp1')],
    ['start()', () => proc.start()],
    ['stop()', () => proc.stop()],
    ['drop()', () => proc.drop()],
    ['stats()', () => proc.stats()],
    ['getStreamProcessorSamples()', () => proc.getStreamProcessorSamples()],
  ] as const) {
    it(`propagates MongoServerError from ${label} unchanged`, async function () {
      executeStub.rejects(serverError);
      const err = await action().catch(e => e);
      expect(err).to.equal(serverError);
      expect(err.code).to.equal(125);
    });
  }

  it('src/stream_processing/ files contain no catch blocks', function () {
    const dir = path.resolve(__dirname, '../../../src/stream_processing');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));
    const catchPattern = /\bcatch\s*\(/;
    for (const file of files) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(src, `${file} must not contain catch blocks`).to.not.match(catchPattern);
    }
  });
});
