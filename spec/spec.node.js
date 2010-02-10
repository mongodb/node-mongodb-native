require.paths.unshift("./spec/lib", "./lib");
process.mixin(GLOBAL, require("sys"))

sys = require("sys")
mongo = require("mongodb/bson/bson")

require("jspec")

process.mixin(mongo, require("mongodb/bson/collections"))
process.mixin(mongo, require("mongodb/bson/binary_parser"))
process.mixin(mongo, require('mongodb/commands/base_command'))
process.mixin(mongo, require("mongodb/commands/update_command"))
process.mixin(mongo, require("mongodb/commands/delete_command"))
process.mixin(mongo, require("mongodb/commands/get_more_command"))
process.mixin(mongo, require("mongodb/commands/insert_command"))
process.mixin(mongo, require("mongodb/commands/kill_cursor_command"))
process.mixin(mongo, require("mongodb/commands/query_command"))
process.mixin(mongo, require("mongodb/commands/update_command"))
process.mixin(mongo, require("mongodb/responses/mongo_reply"))
process.mixin(mongo, require("mongodb/connection"))
process.mixin(mongo, require("mongodb/db"))
process.mixin(mongo, require("mongodb/goog/math/integer"))
process.mixin(mongo, require("mongodb/goog/math/long"))

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
    .exec('spec/spec.commands.js')
JSpec.run({ reporter: JSpec.reporters.Terminal, failuresOnly: true })
JSpec.report()

