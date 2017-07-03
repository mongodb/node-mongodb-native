var EventEmitter = require('events'),
    inherits = require('util').inherits
    changeStreamSimulator = require('./change_stream_simulator');

var ChangeStream = function(changeDomain, pipeline, options) {
  var self = this;

  var createChangeStreamCursor = function () {
    var serverSupportsChangeNotifications = false
    if (serverSupportsChangeNotifications) {
      // An implementation something like this once the server supports the $changeNotifications aggregation pipeline stage
      if (changeDomain.collectionName) {
        // changeStreamCursor = changeDomain.aggregate([{$changeNotifications:{}}].concat(pipeline), options)
      } else if (changeDomain.databaseName) {
        // Somehow create an aggregation with database 1
      } else {
        throw new Error('changeDomain must be either a database or collection.')
      }
    } else {
      if (changeDomain.collectionName) {
        var namespace = {
          database: changeDomain.s.db.databaseName,
          collection:changeDomain.collectionName
        }
        var serverConfig = changeDomain.s.db.serverConfig;
      } else if (changeDomain.databaseName) {
        var namespace = { database: changeDomain.databaseName }
        var serverConfig = changeDomain.serverConfig;
      } else {
        throw new Error('changeDomain must be either a database or collection.')
      }

      // Create the change stream cursor using the black box simulator
      var changeStreamCursor = changeStreamSimulator.createChangeStreamCursor(serverConfig, namespace, pipeline, options)
    }

    changeStreamCursor.on('data', function(data) {
      self.emit('data', data)
    })

    changeStreamCursor.on('close', function() {
      console.log('changeStreamCursor emitted close event in change_stream.js. Attempting to re-open')
      // Attempt to re-create the cursor
      createChangeStreamCursor()
    })

    this.cursor = changeStreamCursor
  }

  createChangeStreamCursor()

}


ChangeStream.prototype.hasNext = function (callback) {
  if (typeof callback === 'function') {
    return this.cursor.hasNext(callback)
  }
  return this.cursor.hasNext()
}

ChangeStream.prototype.next = function (callback) {
  if (typeof callback === 'function') {
    return this.cursor.next(callback)
  }
  return this.cursor.next()
}


inherits(ChangeStream, EventEmitter)

module.exports = ChangeStream;
