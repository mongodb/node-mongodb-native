const {
  makeClient,
  connectClient,
  initDb,
  disconnectClient,
  dropDb,
  initCollection,
  createCollection,
  dropCollection,
  makeLoadJSON,
  makeLoadTweets
} = require('../../driverBench/common');

function makeTestInsertOne(numberOfOps) {
  return function (done) {
    const loop = _id => {
      if (_id > numberOfOps) {
        return done();
      }

      const doc = Object.assign({}, this.doc);

      this.collection.insertOne(doc, err => (err ? done(err) : loop(_id + 1)));
    };

    loop(1);
  };
}

function findOneById(done) {
  const loop = _id => {
    if (_id > 10000) {
      return done();
    }

    return this.collection.findOne({ _id }, err => (err ? done(err) : loop(_id + 1)));
  };

  return loop(1);
}

function runCommand(done) {
  const loop = _id => {
    if (_id > 10000) {
      return done();
    }
    return this.db.command({ hello: true }, err => (err ? done(err) : loop(_id + 1)));
  };

  return loop(1);
}

function makeSingleBench(suite) {
  suite
    .benchmark('runCommand', benchmark =>
      benchmark
        .taskSize(0.16)
        .setup(makeClient)
        .setup(connectClient)
        .setup(initDb)
        .task(runCommand)
        .teardown(disconnectClient)
    )
    .benchmark('findOne', benchmark =>
      benchmark
        .taskSize(16.22)
        .setup(makeLoadJSON('tweet.json'))
        .setup(makeClient)
        .setup(connectClient)
        .setup(initDb)
        .setup(dropDb)
        .setup(initCollection)
        .setup(makeLoadTweets(true))
        .task(findOneById)
        .teardown(dropDb)
        .teardown(disconnectClient)
    )
    .benchmark('smallDocInsertOne', benchmark =>
      benchmark
        .taskSize(2.75)
        .setup(makeLoadJSON('small_doc.json'))
        .setup(makeClient)
        .setup(connectClient)
        .setup(initDb)
        .setup(dropDb)
        .setup(initDb)
        .setup(initCollection)
        .setup(createCollection)
        .beforeTask(dropCollection)
        .beforeTask(createCollection)
        .beforeTask(initCollection)
        .task(makeTestInsertOne(10000))
        .teardown(dropDb)
        .teardown(disconnectClient)
    )
    .benchmark('largeDocInsertOne', benchmark =>
      benchmark
        .taskSize(27.31)
        .setup(makeLoadJSON('large_doc.json'))
        .setup(makeClient)
        .setup(connectClient)
        .setup(initDb)
        .setup(dropDb)
        .setup(initDb)
        .setup(initCollection)
        .setup(createCollection)
        .beforeTask(dropCollection)
        .beforeTask(createCollection)
        .beforeTask(initCollection)
        .task(makeTestInsertOne(10))
        .teardown(dropDb)
        .teardown(disconnectClient)
    );
}

module.exports = { makeSingleBench };
