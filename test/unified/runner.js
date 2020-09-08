'use strict';
const expect = require('chai').expect;
const path = require('path');
const semver = require('semver');
const MongoClient = require('../../src/mongo_client').MongoClient;

class Version {
  static clean(version) {
    return semver.coerce(version).version;
  }
  static check(supportedSchemaVersions, schemaVersion) {
    let satisfies = false;
    supportedSchemaVersions.map(Version.clean).forEach(v => {
      if (satisfies) return;
      const result = semver.satisfies(v, `^${Version.clean(schemaVersion)}`);
      if (result) satisfies = true;
    });
    return satisfies;
  }
  static validate(supportedSchemaVersions, spec) {
    const check = Version.check(supportedSchemaVersions, spec.schemaVersion);
    if (!check) throw new Error(`invalid schemaVersion: ${spec.description}`);
  }
}

class Match {
  static value(value, matcher, expectation) {
    switch (matcher) {
      // TODO: add in all matchers
      case '$$unsetOrMatches': {
        expect(value).to.be.oneOf([undefined, expectation]);
      }
    }
  }
  static expectedResult(expected, actual) {
    if (typeof expected === 'object') {
      Object.keys(expected).forEach(key => {
        const expectedValue = expected[key];
        const actualValue = actual[key];
        if (typeof expectedValue === 'object') {
          Object.keys(expectedValue).forEach(matcher => {
            const matcherValue = expectedValue[matcher];
            Match.value(actualValue, matcher, matcherValue);
          });
        }
      });
    }
  }
}

// TODO: create constants for all client event ids
const COMMAND_STARTED = 'commandStarted';

// TODO: add in mappings for all methods
const argMap = {
  insertOne: a => [a.document]
};

class Runner {
  constructor(spec, filePath) {
    this.supportedSchemaVersions = ['1.0.0'];
    Version.validate(this.supportedSchemaVersions, spec);
    if (filePath) {
      this.filePath = filePath;
      this.fileName = path.basename(filePath);
    }
    this.entities = [];
    this.clientEntityIds = [];
    this.clientEvents = [];
    this.TOP_CLIENT = Symbol('TOP_CLIENT');
    this.spec = spec;
    if (!this.spec.runOnRequirements) {
      this.spec.runOnRequirements.push({});
    }
  }
  get client() {
    return this.getEntity(this.TOP_CLIENT);
  }
  message() {
    // console.log(msg);
  }
  getEntity(id) {
    if (this.entities[id]) {
      return this.entities[id];
    } else {
      throw new Error(`runner entity not found ${id.toString()}`);
    }
  }
  getEvents(id) {
    if (this.clientEvents[id]) {
      return this.clientEvents[id];
    } else {
      throw new Error(`runner clientEvent not found ${id.toString()}`);
    }
  }
  setEntity(id, value, type) {
    this.message(`storing entity with id ${id.toString()}`);
    this.entities[id] = value;
    if (type === 'client') this.clientEntityIds.push(id);
    return this.entities[id];
  }
  setEvent(id, type, event) {
    this.message(`storing events with id ${id}`);
    if (!this.clientEvents[id]) this.clientEvents[id] = [];
    this.clientEvents[id].push({
      [`${type}Event`]: event
    });
    return this.clientEvents[id];
  }
  static clientShouldObserve(props, event) {
    if (!props) return false;
    if (!props.observeEvents) return false;
    if (props.observeEvents.includes(`${event}Event`)) return true;
    return false;
  }
  createClient(props, callback) {
    this.message(`creating client with id ${props.id.toString()}`);
    const id = props.id;
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('URI is not set');
    const options = Object.assign({}, props.uriOptions, { monitorCommands: true });
    const client = new MongoClient(uri, options);
    let entity, events;
    return client.connect((err, client) => {
      if (Runner.clientShouldObserve(props, COMMAND_STARTED)) {
        client.on(COMMAND_STARTED, response => {
          events = this.setEvent(id, COMMAND_STARTED, response);
        });
      }
      entity = this.setEntity(id, client, 'client');
      return callback(err, { events, entity });
    });
  }
  createDatabase(props, callback) {
    this.message(`creating database with id ${props.id.toString()}`);
    const id = props.id;
    const client = this.getEntity(props.client);
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('URI is not set');
    const db = client.db(props.databaseName);
    const entity = this.setEntity(id, db);
    return callback(undefined, { entity });
  }
  createCollection(props, callback) {
    this.message(`creating collection with id ${props.id.toString()}`);
    const id = props.id;
    const db = this.getEntity(props.database);
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('URI is not set');
    db.collection(props.collectionName, (err, collection) => {
      if (err) return callback(err);
      const entity = this.setEntity(id, collection);
      return callback(undefined, { entity });
    });
  }
  createTopClient(callback) {
    this.message(`creating top client`);
    return this.createClient({ id: this.TOP_CLIENT }, callback);
  }
  createEntities(callback) {
    this.message(`creating entities`);
    const cbs = this.spec.createEntities.map(entityData => {
      return cb => {
        if (entityData.client) return this.createClient(entityData.client, cb);
        if (entityData.database) return this.createDatabase(entityData.database, cb);
        if (entityData.collection) return this.createCollection(entityData.collection, cb);
        return cb();
      };
    });
    return Runner.callbacksAll(cbs, callback);
  }
  createInitialData(cb) {
    this.message(`creating initial data`);
    const initialData = this.spec.initialData || [];
    const cbs = initialData.map(data => {
      return cb => {
        const database = this.client.db(data.databaseName);
        database.collection(data.collectionName, (err, collection) => {
          if (err) return cb(err);
          return collection.insertMany(data.documents, cb);
        });
      };
    });
    return Runner.callbacksAll(cbs, cb);
  }
  removeInitialData(cb) {
    this.message(`creating initial data`);
    const initialData = this.spec.initialData || [];
    const cbs = initialData.map(data => {
      return cb => {
        const database = this.client.db(data.databaseName);
        database.collection(data.collectionName, (err, collection) => {
          if (err) return cb(err);
          return collection.drop(cb);
        });
      };
    });
    return Runner.callbacksAll(cbs, cb);
  }
  handleOperation(operation, cb) {
    const parent = this.entities[operation.object];
    const args = argMap[operation.name](operation.arguments);
    args.push((err, result) => {
      if (err) return cb(err);
      if (operation.saveResultAsEntity) {
        const id = operation.saveResultAsEntity;
        this.entities[id] = result;
      }
      if (operation.expectedResult) {
        const expectedResult = operation.expectedResult;
        Match.expectedResult(expectedResult, result);
      }
      if (operation.expectedErrors) {
        return this.handleExpectedError(operation.expectedErrors, err);
      }
      return cb();
    });
    parent[operation.name].apply(parent, args);
  }
  handleOperations(operations, cb) {
    const cbs = operations.map(operation => cb => this.handleOperation(operation, cb));
    return Runner.callbacksAll(cbs, cb);
  }
  handleExpectedEvents(expectedEvents, cb) {
    expectedEvents.forEach(expectedEvent => {
      const events = this.getEvents(expectedEvent.client);
      expectedEvent.events.forEach((event, id) => {
        const storedEvent = events[id];
        const expectEvent = (storedEvent, event, type) => {
          expect(storedEvent).to.have.property(type);
          expect(event).to.have.property(type);
          const shared = ['commandName', 'databaseName', 'command'];
          const storedEventPicked = Runner.pick(storedEvent, shared);
          const eventPicked = Runner.pick(event, shared);
          expect(storedEventPicked).to.deep.equal(eventPicked);
        };
        // TODO: add in extra events not in example POC
        if (event.commandStartedEvent) expectEvent(storedEvent, event, 'commandStartedEvent');
      });
    });
    return cb();
  }

  // TODO: handle errors
  handleExpectedError(/** expectedErrors, err */) {}

  handleOutcome(outcome, cb) {
    const cbs = outcome.map(outcome => {
      return cb => {
        const db = this.client.db(outcome.databaseName);
        db.collection(outcome.collectionName, (err, collection) => {
          if (err) return cb(err);
          const cursor = collection.find();
          cursor.toArray((err, results) => {
            if (err) cb(err);
            expect(err).to.not.exist;
            expect(results).to.deep.equal(outcome.documents);
            return cursor.close(cb);
          });
        });
      };
    });
    return Runner.callbacksAll(cbs, cb);
  }
  handleTest(test, cb) {
    return Runner.callbacksAll(
      [
        cb => this.handleOperations(test.operations, cb),
        cb => this.handleExpectedEvents(test.expectedEvents, cb),
        cb => this.handleOutcome(test.outcome, cb)
      ],
      cb
    );
  }
  static callbacksAll(tasks, cb) {
    const results = [];
    let foundError = undefined;
    return tasks.reverse().reduce((cb, task) => {
      return () => {
        if (foundError) return cb(foundError);
        task((err, result) => {
          if (err) {
            foundError = err;
            return cb(err);
          }
          results.push(result);
          return cb(undefined, results);
        });
      };
    }, cb)();
  }
  /** @see https://gist.github.com/bisubus/2da8af7e801ffd813fab7ac221aa7afc#file-pick-es2015-js */
  static pick(obj, picked) {
    return Object.keys(obj)
      .filter(key => picked.indexOf(key) >= 0)
      .reduce((newObj, key) => Object.assign(newObj, { [key]: obj[key] }), {});
  }
  resetEntityMap(cb) {
    this.entities = [];
    this.clientEvents = [];
    this.clientEntityIds = [];
    return cb();
  }
  closeClients(cb) {
    const cbs = this.clientEntityIds.map(id => {
      return cb => {
        const client = this.getEntity(id);
        return client.close(true, cb);
      };
    });
    return Runner.callbacksAll(cbs, cb);
  }
  static singleOrArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
  }
  static createMetadata(req) {
    const topology = Runner.singleOrArray(req.topology);
    const minServerVersion = req.minServerVersion;
    const maxServerVersion = req.maxServerVersion;
    let mongodb = [];
    if (minServerVersion) mongodb.push(`>=${Version.clean(minServerVersion)}`);
    if (maxServerVersion) mongodb.push(`<=${Version.clean(maxServerVersion)}`);
    const requires = {};
    if (topology.length) requires.topology = topology;
    if (mongodb.length) requires.mongodb = mongodb.join(' ');
    return { requires };
  }
  static createTestDescription(test, data) {
    let description = [test.description];
    if (data.topology && data.topology.length) description.push(data.topology.join(','));
    if (data.mongodb) description.push(data.mongodb);
    return description.join(' - ');
  }
  static handleSpec(spec) {
    const r = new Runner(spec);
    describe(r.spec.description, () => {
      r.spec.tests.forEach(test => {
        r.spec.runOnRequirements.forEach(req => {
          const metadata = Runner.createMetadata(req);
          const description = Runner.createTestDescription(test, metadata.requires);
          it(description, metadata, function (done) {
            Runner.callbacksAll(
              [
                cb => r.createTopClient(cb),
                cb => r.createEntities(cb),
                cb => r.removeInitialData(cb),
                cb => r.createInitialData(cb),
                cb => r.handleTest(test, cb),
                cb => r.closeClients(cb),
                cb => r.resetEntityMap(cb)
              ],
              done
            );
          });
        });
      });
    });
  }
}

module.exports = {
  Version,
  Runner
};
