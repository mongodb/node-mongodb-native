var makeCursor = function (serverTopology) {
  var DB = require('./db')

  var localDB = new DB('local', serverTopology)
  var oplogCollection = localDB.collection('oplog.rs')

  return oplogCollection.find({
    fromMigrate: {
      $exists : false
    },
    op: {
      $ne:'n'
    }
  }, {
    tailable: true,
    awaitdata: true
  }).map(convertFromOplogToChangeNotification).filter({'op': 'c'})

}

var convertFromOplogToChangeNotification = function (oplogMessage) {
  let output = {};

  // Populate the _id field
  output._id = {
    ts: oplogMessage.ts,
    ns: oplogMessage.ns,
    h: oplogMessage.h
  }

  // Populate the operationType field
  switch (oplogMessage.op) {
    case 'i':
      output.operationType = 'insert'
      break;
    case 'd':
      output.operationType = 'delete'
      break;
    case 'u':
      output.operationType = (oplogMessage.o['$set'] || oplogMessage.o['$unset']) ? 'update' : 'replace'
      break;
    case 'c':
      if (oplogMessage.o.renameCollection || oplogMessage.o.drop) {
        output.operationType = 'invalidate'
      } else {
        return null
      }
      break;
    default:
      throw new Error('Unknown operation type "%s".', oplogMessage.op)
  }

  // Populate the ns (namespace) field
  let namespace = oplogMessage.ns.split('.')
  if (oplogMessage.op === 'c') {
    if (oplogMessage.o.drop) {
      namespace[1] = oplogMessage.o.drop
    } else if (oplogMessage.o.renameCollection) {
      namespace[1] = oplogMessage.o.renameCollection.split('.')[1]
    } else {
      throw new Error('Unable to determine collection name.')
    }
  }
  output.ns = {
    db: namespace[0],
    coll: namespace[1]
  }

  // Populate the documentKey field (for insert, update, replace, and delete operations only)
  if (['insert', 'update', 'replace', 'delete'].includes(output.operationType)) {
    output.documentKey = oplogMessage.o._id || oplogMessage.o2._id
  }

  // Populate the newDocument field (for insert and replace operations only)
  if (['insert', 'replace'].includes(output.operationType)) {
    output.newDocument = oplogMessage.o
  }

  // Populate the updateDescription field (for update operations only)
  if (output.operationType === 'update') {
    output.updateDescription = {}
    if (oplogMessage.o['$set']) {
      output.updateDescription.updatedFields = oplogMessage.o['$set']
    }
    if (oplogMessage.o['$unset']) {
      output.updateDescription.removedFields = Object.keys(oplogMessage.o['$unset'])
    }
  }

  // TODO: Include the lookedUpDocument if the ‘fullDocument’ argument to $changeNotification is ‘lookup’

  return output
}

module.exports.makeCursor = makeCursor
