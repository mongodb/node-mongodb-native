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

    if (self.changeListenerExists) {
      changeStreamCursor.on('data', function (data) {
        self.emit('change', data)
      })
    }

    changeStreamCursor.on('close', function() {
      if (!self.shuttingDown) {
        console.log('changeStreamCursor emitted close event in change_stream.js. Attempting to re-open')
        // Attempt to re-create the cursor
        createChangeStreamCursor()
      }
    })
    self.cursor = changeStreamCursor
  }

  createChangeStreamCursor()

  self.on('newListener', function(eventName) {
    if (eventName === 'change') {
      self.changeListenerExists = true;
      self.cursor.on('data', function (data) {
        self.emit('change', data)
      })
    }
  })

}

ChangeStream.prototype.resumeToken = function () {
  // Return the most recent resumeToken
}

ChangeStream.prototype.hasNext = function (callback) {
  if (typeof callback === 'function') {
    return this.cursor.hasNext(callback)
  }
  return this.cursor.hasNext()
}

ChangeStream.prototype.next = function (callback) {
  if (this.isClosed()) {
    if (callback) return callback(new Error('Change Stream is not open.'), null)
    return Promise.reject('Change Stream is not open.')
  }
  if (typeof callback === 'function') {
    return this.cursor.next(callback)
  }
  return this.cursor.next()
}

ChangeStream.prototype.isClosed = function () {
  if (!this.cursor) {
    return true;
  }
  return this.cursor.isClosed();
}

ChangeStream.prototype.close = function (callback) {
  this.shuttingDown = true
  if (!this.isClosed()) {
    if (typeof callback === 'function') {
      return this.cursor.close(callback)
    }
    return this.cursor.close()
  }
}


inherits(ChangeStream, EventEmitter)

module.exports = ChangeStream;
