var createChangeNotificationCursor = function (serverTopology, namespace, pipeline) {
  var DB = require('./db')

  pipeline = pipeline || []

  var localDB = new DB('local', serverTopology)
  var oplogCollection = localDB.collection('oplog.rs')

  var query = {
    fromMigrate: {
      $exists : false
    },
    op: {
      $ne:'n'
    }
  }
  if (namespace) {
    query.$or = [
      { ns: namespace },
      { "o.renameCollection": namespace }
    ]
  }

  // Construct the tailable/awaitdata cursor on the oplog
  var oplogCursor = oplogCollection.find(query, {
    tailable: true,
    awaitdata: true
  }).map(function processOplogDocument(oplogDocument) {
    oplogDocument = convertFromOplogToChangeNotification(oplogDocument)

    pipeline.forEach(function(pipelineStage) {
      var stageName = Object.keys(pipelineStage)[0]
      switch (stageName) {
        // case '$match':
        //
        //   break;
        default:
          throw new Error('Unsupported pipeline stage name "' + stageName + '".')
      }
    })

    return oplogDocument
  })

  return oplogCursor

}

var convertFromOplogToChangeNotification = function (oplogDocument) {
  let output = {};

  // Populate the _id field
  output._id = {
    ts: oplogDocument.ts,
    ns: oplogDocument.ns,
    h: oplogDocument.h
  }

  // Populate the operationType field
  switch (oplogDocument.op) {
    case 'i':
      output.operationType = 'insert'
      break;
    case 'd':
      output.operationType = 'delete'
      break;
    case 'u':
      output.operationType = (oplogDocument.o['$set'] || oplogDocument.o['$unset']) ? 'update' : 'replace'
      break;
    case 'c':
      if (oplogDocument.o.renameCollection || oplogDocument.o.drop) {
        output.operationType = 'invalidate'
      } else {
        return null
      }
      break;
    default:
      throw new Error('Unknown operation type', oplogDocument.op)
  }

  // Populate the ns (namespace) field
  let namespace = oplogDocument.ns.split('.')
  if (oplogDocument.op === 'c') {
    if (oplogDocument.o.drop) {
      namespace[1] = oplogDocument.o.drop
    } else if (oplogDocument.o.renameCollection) {
      namespace[1] = oplogDocument.o.renameCollection.split('.')[1]
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
    output.documentKey = oplogDocument.o._id || oplogDocument.o2._id
  }

  // Populate the newDocument field (for insert and replace operations only)
  if (['insert', 'replace'].includes(output.operationType)) {
    output.newDocument = oplogDocument.o
  }

  // Populate the updateDescription field (for update operations only)
  if (output.operationType === 'update') {
    output.updateDescription = {}
    if (oplogDocument.o['$set']) {
      output.updateDescription.updatedFields = oplogDocument.o['$set']
    }
    if (oplogDocument.o['$unset']) {
      output.updateDescription.removedFields = Object.keys(oplogDocument.o['$unset'])
    }
  }

  // TODO: Include the lookedUpDocument if the ‘fullDocument’ argument to $changeNotification is ‘lookup’

  return output
}

module.exports.createChangeNotificationCursor = createChangeNotificationCursor
