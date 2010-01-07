require.paths.unshift("./spec/lib", "./lib");
process.mixin(GLOBAL, require("sys"))
// process.mixin(GLOBAL, require("goog/base"))

sys = require("sys")
require("jspec")
require("mongodb/mongo")
require("mongodb/bson/bson")
require("mongodb/bson/collections")
require("mongodb/bson/binary_parser")

require("mongodb/commands/base_command")
require("mongodb/commands/update_command")
require("mongodb/commands/delete_command")
require("mongodb/commands/get_more_command")
require("mongodb/commands/insert_command")
require("mongodb/commands/kill_cursor_command")
require("mongodb/commands/query_command")
require("mongodb/commands/update_command")
require("mongodb/responses/mongo_reply")
require("mongodb/db")
require("mongodb/connection")

require("goog/math/integer")
require("goog/math/long")

var posix = require('posix')

quit = process.exit
print = puts

readFile = function(path) {
  var promise = posix.cat(path, "utf8")
  var result = ''
  promise.addErrback(function(){ throw "failed to read file `" + path + "'" })
  promise.addCallback(function(contents){
    result = contents
  })
  promise.wait()
  return result
}

if (process.ARGV[2])
  JSpec.exec('spec/spec.' + process.ARGV[2] + '.js')  
else
  JSpec
    .exec('spec/spec.bson.js')
    // .exec('spec/spec.mongo.js')
    .exec('spec/spec.commands.js')
JSpec.run({ formatter: JSpec.formatters.Terminal, failuresOnly: true })
JSpec.report()

