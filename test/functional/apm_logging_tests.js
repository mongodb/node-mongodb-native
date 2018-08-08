'use strict';

const fs = require('fs');
const setupDatabase = require('./shared').setupDatabase;
const chai = require('chai');
const expect = chai.expect;
const MongoClient = require('../..').MongoClient;
const EJSON = require('mongodb-extjson');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
chai.use(sinonChai);

const testLogFile = process.cwd() + '/apm_test_log';
const loggingEvents = [
  'commandStarted',
  'commandSucceeded',
  'commandFailed',
  'serverOpening',
  'serverDescriptionChanged',
  'serverHeartbeatStarted',
  'serverHeartbeatSucceeded',
  'serverHeartbeatFailed',
  'serverClosed',
  'topologyOpening',
  'topologyClosed',
  'topologyDescriptionChanged'
];

function stringify(obj) {
  return EJSON.stringify(obj, { relaxed: true });
}

function removeTestLogs() {
  fs
    .readdirSync(process.cwd())
    .filter(x => x.indexOf('apm_test_log') !== -1)
    .forEach(file => fs.unlinkSync(file));
}

function getFileData(file) {
  return file
    .trim()
    .split('\n')
    .reduce(
      (data, current) => {
        const event = EJSON.parse(current);
        data.eventStrings.push(stringify(event.object));
        data[event.type].push(event);
        data.numLines += 1;
        return data;
      },
      { numLines: 0, command: [], sdam: [], eventStrings: [] }
    );
}

function runTestClient(context, urlOptions, closeCb) {
  const configuration = context.configuration;
  const url = configuration.url() + urlOptions;
  const client = new MongoClient(url, { w: 1, useNewUrlParser: true });
  const events = [];

  loggingEvents.forEach(event => client.on(event, e => events.push(stringify(e))));

  client.connect(function(err) {
    expect(err).to.be.null;
    client.close(err => {
      // set timeout to make sure all file writes are completed
      setTimeout(() => {
        closeCb(err, events);
      }, 10);
    });
  });
}

describe('APM Logging', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  after(function() {
    removeTestLogs();
  });

  it('should create stream to default location if monitorOut not specified', function(done) {
    const configuration = this.configuration;
    const url = configuration.url() + '?monitor=command';
    const client = new MongoClient(url, { w: 1, useNewUrlParser: true });

    // avoid overwriting any of the user's pre-existing logs at the default location
    const stub = sinon.stub(fs, 'createWriteStream');
    const defaultFile = process.cwd() + '/monitor.log';

    client.connect(function() {
      expect(stub).to.have.been.calledWith(defaultFile);
      stub.restore();
      done();
    });
  });

  it('should log to stdout if specified', function(done) {
    const spy = sinon.spy(process.stdout, 'write');
    const cb = err => {
      expect(spy).to.have.been.calledTwice;
      spy.restore();
      done(err);
    };
    runTestClient(this, '?monitor=command&monitorOut=stdout', cb);
  });

  it('should log to stderr if specified', function(done) {
    const spy = sinon.spy(process.stderr, 'write');
    const cb = err => {
      expect(spy).to.have.been.calledTwice;
      spy.restore();
      done(err);
    };
    runTestClient(this, '?monitor=command&monitorOut=stderr', cb);
  });

  it('log only sdam events', function(done) {
    const cb = err => {
      const logFile = fs.readFileSync(testLogFile, 'utf8');
      const data = getFileData(logFile);

      expect(data.numLines).to.equal(6);
      expect(data.command).to.be.empty;
      done(err);
    };
    runTestClient(this, '?monitor=sdam&monitorOut=apm_test_log', cb);
  });

  it('log only command events', function(done) {
    const cb = err => {
      const logFile = fs.readFileSync(testLogFile, 'utf8');
      const data = getFileData(logFile);

      expect(data.numLines).to.equal(2);
      expect(data.sdam).to.be.empty;
      done(err);
    };
    runTestClient(this, '?monitor=command&monitorOut=apm_test_log', cb);
  });

  // skip for now: this test depends on the new fixes in the core uri-parser
  it.skip('log both command and sdam events using `monitor=command,sdam`', function(done) {
    const cb = err => {
      const logFile = fs.readFileSync(testLogFile, 'utf8');
      const data = getFileData(logFile);

      expect(data.numLines).to.equal(8);
      expect(data.sdam).to.not.be.empty;
      expect(data.command).to.not.be.empty;
      done(err);
    };
    runTestClient(this, '?monitor=command,sdam&monitorOut=apm_test_log', cb);
  });

  it('log both command and sdam events using `monitor=all`', function(done) {
    const cb = err => {
      const logFile = fs.readFileSync(testLogFile, 'utf8');
      const data = getFileData(logFile);

      expect(data.numLines).to.equal(8);
      expect(data.sdam).to.not.be.empty;
      expect(data.command).to.not.be.empty;
      done(err);
    };
    runTestClient(this, '?monitor=all&monitorOut=apm_test_log', cb);
  });

  it('should log correct event objects in the same order they were emitted', function(done) {
    const cb = (err, events) => {
      const logFile = fs.readFileSync(testLogFile, 'utf8');
      const data = getFileData(logFile);

      expect(events).to.deep.equal(data.eventStrings);
      done(err);
    };
    runTestClient(this, '?monitor=all&monitorOut=apm_test_log', cb);
  });

  it('should call callback with error when log filename cannot be resolved', {
    metadata: { requires: { node: '<10.0.0' } },
    test: function(done) {
      const configuration = this.configuration;
      const url = configuration.url() + '?monitor=all&monitorOut=invalid:name';
      const client = new MongoClient(url, { w: 1, useNewUrlParser: true });

      client.connect(function(err) {
        expect(err).to.exist;
        console.log(err);
        expect(err.name).to.equal('TypeError');
        expect(err.message).to.equal(`Path must be a string. Received { invalid: 'name' }`);
        done();
      });
    }
  });

  it('should call callback with error when log filename cannot be resolved', {
    metadata: { requires: { node: '>=10.0.0' } },
    test: function(done) {
      const configuration = this.configuration;
      const url = configuration.url() + '?monitor=all&monitorOut=invalid:name';
      const client = new MongoClient(url, { w: 1, useNewUrlParser: true });

      client.connect(function(err) {
        expect(err).to.exist;
        expect(err.name).to.equal('TypeError [ERR_INVALID_ARG_TYPE]');
        expect(err.message).to.equal(
          `The "path" argument must be of type string. Received type object`
        );
        done();
      });
    }
  });

  // TODO: how to test throwing errors if we don't know exactly when the error will be thrown?
  it.skip('should throw error when file stream emits error after client has connected', function(done) {
    const configuration = this.configuration;
    const url = configuration.url() + '?monitor=all&monitorOut=nonexistent/file/path';
    const client = new MongoClient(url, { w: 1, useNewUrlParser: true });

    client.connect(() => done());
  });
});
