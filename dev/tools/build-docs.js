var fs = require('fs'),
  dox = require('dox'),
  parseJS = require('uglify-js').parser,
  ejs = require('ejs'),
  exec = require('child_process').exec,
  format = require('util').format,
  format = require('util').format,
  docs = require('./docs');

// ----------------------------------------------------------------------------
// INITALIZE
// ----------------------------------------------------------------------------
// All source files for the api generation
var apiClasses = [
    {tag:"admin", path:"./lib/mongodb/admin.js"},
    {tag:"collection", path:"./lib/mongodb/collection.js"},
    {tag:"mongoclient", path:"./lib/mongodb/mongo_client.js"},
    {tag:"db", path:"./lib/mongodb/db.js"},
    {tag:"cursor", path:"./lib/mongodb/cursor.js"},
    {tag:"cursorstream", path:"./lib/mongodb/cursorstream.js"},
    {tag:"gridstore", path:"./lib/mongodb/gridfs/gridstore.js"},
    {tag:"readstream", path:"./lib/mongodb/gridfs/readstream.js"},
    {tag:"grid", path:"./lib/mongodb/gridfs/grid.js"},
    {tag:"server", path:"./lib/mongodb/connection/server.js"},
    {tag:"mongos", path:"./lib/mongodb/connection/mongos.js"},
    {tag:"replset", path:"./lib/mongodb/connection/repl_set/repl_set.js"},
    {tag:"readpreference", path:"./lib/mongodb/connection/read_preference.js"},
    {tag:"ordered", path:"./lib/mongodb/collection/batch/ordered.js"},
    {tag:"unordered", path:"./lib/mongodb/collection/batch/unordered.js"},
    {tag:"batchwriteresult", path:"./lib/mongodb/collection/batch/common.js"}
];

// All test files
var testClasses = [];
// Read in all the test files and create a testClasses collection
var files = fs.readdirSync("./test/functional");
files.forEach(function(file) {
  if(file.indexOf('.js') != -1) testClasses.push({path: "./test/functional/" + file});
})

// // Read all gridstore files
// files = fs.readdirSync("./test/tests/functional/gridstore");
// files.forEach(function(file) {
//   if(file.indexOf('.js') != -1) testClasses.push({path: "./test/tests/functional/gridstore/" + file});
// })

// // Read all gridstore files
// files = fs.readdirSync("./test/tests/functional/fluent_api");
// files.forEach(function(file) {
//   if(file.indexOf('.js') != -1) testClasses.push({path: "./test/tests/functional/fluent_api/" + file});
// })

// // Read all replicaset files
// files = fs.readdirSync("./test/tests/repl_set");
// files.forEach(function(file) {
//   if(file.indexOf('.js') != -1) testClasses.push({path: "./test/tests/repl_set/" + file});
// })

// // Sharded tests
// files = fs.readdirSync("./test/tests/sharded");
// files.forEach(function(file) {
//   if(file.indexOf('.js') != -1) testClasses.push({path: "./test/tests/sharded/" + file});
// })

// // Authentication tests
// files = fs.readdirSync("./test/tests/authentication");
// files.forEach(function(file) {
//   if(file.indexOf('.js') != -1) testClasses.push({path: "./test/tests/authentication/" + file});
// })

// // SSL tests
// files = fs.readdirSync("./test/tests/ssl");
// files.forEach(function(file) {
//   if(file.indexOf('.js') != -1) testClasses.push({path: "./test/tests/ssl/" + file});
// })

// Read all the templates
var templates = [
  {tag:'index', path:'./dev/tools/doc-templates/index.ejs'},
  {tag:'changelog', path:'./dev/tools/doc-templates/changelog.ejs'},
  {tag:'index_no_header', path:'./dev/tools/doc-templates/index_no_header.ejs'},
  {tag:'class', path:'./dev/tools/doc-templates/class.ejs'},
  {tag:'github', path:'./dev/tools/doc-templates/github.ejs'},
  {tag:'function', path:'./dev/tools/doc-templates/function.ejs'}
]

// Output directory
var outputDirectory = "./docs/sphinx-docs/source/api-generated"

// ----------------------------------------------------------------------------
// PROCESS Driver API
// ----------------------------------------------------------------------------
docs.renderAPIDocs(outputDirectory, apiClasses, testClasses, templates, {index_title:'Driver API'});

// ----------------------------------------------------------------------------
// PROCESS BSON API
// ----------------------------------------------------------------------------
// Output directory
var outputDirectory2 = "./docs/sphinx-docs/source/api-bson-generated"
// Force create the directory for the generated docs
exec('rm -rf ' + outputDirectory2, function (error, stdout, stderr) {});
exec('mkdir ' + outputDirectory2, function (error, stdout, stderr) {});

var apiClasses2 = [
    {tag:"objectid", path:"./node_modules/bson/lib/bson/objectid.js"},
    {tag:"binary", path:"./node_modules/bson/lib/bson/binary.js"},
    {tag:"code", path:"./node_modules/bson/lib/bson/code.js"},
    {tag:"db_ref", path:"./node_modules/bson/lib/bson/db_ref.js"},
    {tag:"double", path:"./node_modules/bson/lib/bson/double.js"},
    {tag:"minkey", path:"./node_modules/bson/lib/bson/min_key.js"},
    {tag:"maxkey", path:"./node_modules/bson/lib/bson/max_key.js"},
    {tag:"symbol", path:"./node_modules/bson/lib/bson/symbol.js"},
    {tag:"timestamp", path:"./node_modules/bson/lib/bson/timestamp.js"},
    {tag:"long", path:"./node_modules/bson/lib/bson/long.js"},
    {tag:"bson", path:"./node_modules/bson/lib/bson/bson.js"}
  ];

// Render the API docs
docs.renderAPIDocs(outputDirectory2, apiClasses2, testClasses, templates, {index_title:'Binary JSON API'});

// process.exit(0)

// ----------------------------------------------------------------------------
// PROCESS MARKDOWN DOCUMENTS TO STRUCTURED TEXT
// ----------------------------------------------------------------------------
// Transform the versionb based content
var articles = [
    {name:"AnIntroductionTo1_4_and_2_6", output:"AnIntroductionTo1_4_and_2_6.rst", path:"./docs/articles/AnIntroductionTo1_4_and_2_6.md"},
    {name:"MongoClient", output:"MongoClient.rst", path:"./docs/articles/MongoClient.md"},
    {name:"AnIntroductionTo1_1And2_2", output:"AnIntroductionTo1_1And2_2.rst", path:"./docs/articles/AnIntroductionTo1_1And2_2.md"}
  ];

// Tranform the markdown to restructured text
docs.writeMarkDownFile("./docs/sphinx-docs/source/driver-articles", articles, templates,
  {title:'Updates', template:'index'});

// Transform the tutorials
var articles = [
    {name:"NodeKOArticle1", output:"NodeKOArticle1.rst", path:"./docs/articles/NodeKOArticle1.md"},
    {name:"NodeKOArticle2", output:"NodeKOArticle2.rst", path:"./docs/articles/NodeKOArticle2.md"}
  ];

// Tranform the markdown to restructured text
docs.writeMarkDownFile("./docs/sphinx-docs/source/api-articles", articles, templates,
  {title:'Articles', template:'index'});

// Transform the tutorials
var articles = [
    {name:"collections", output:"collections.rst", path:"./docs/collections.md"},
    {name:"gridfs", output:"gridfs.rst", path:"./docs/gridfs.md"},
    {name:"indexes", output:"indexes.rst", path:"./docs/indexes.md"},
    {name:"insert", output:"insert.rst", path:"./docs/insert.md"},
    {name:"queries", output:"queries.rst", path:"./docs/queries.md"}
  ];

// Tranform the markdown to restructured text
docs.writeMarkDownFile("./docs/sphinx-docs/source/markdown-docs", articles, templates,
  {title:'Using the driver', template:'index_no_header'});

// ----------------------------------------------------------------------------
// WRITE CHANGELOG TO THE DOCUMENTATION
// ----------------------------------------------------------------------------
// Outputdiectory
var outputDirectoryChangelog = "./docs/sphinx-docs/source/changelog";
// Force create the directory for the generated docs
exec('rm -rf ' + outputDirectoryChangelog, function (error, stdout, stderr) {});
exec('mkdir ' + outputDirectoryChangelog, function (error, stdout, stderr) {
  // Read all the templates
  var templateObjects = docs.readAllTemplates(templates);
  // Read the changelog
  var changelog = fs.readFileSync('./HISTORY').toString();
  // Just write out the index
  var content = ejs.render(templateObjects["changelog"], {content:changelog});
  // Write it out
  fs.writeFileSync(format("%s/changelog.rst", outputDirectoryChangelog), content);
});

// ----------------------------------------------------------------------------
// Generate using the driver pages
// ----------------------------------------------------------------------------
// Outputdiectory
var outputDirectoryGithub = "./docs/sphinx-docs/source/github";
var inputFile = "./docs/sphinx-docs/npm_dependent_packages.json";

// tag descriptions
var tagDescriptions = {
  odm: "Object Document Modeling Libraries",
  webframework: "Web frameworks using MongoDB",
  cms: "Content Management Systems",
  gridfs: "Grid FS libraries or tools",
  wrapper: "Wrapper libraries to ease the use of development or provide simple ODM like behaviours",
  rest: "REST api's around MongoDB or resource based libraries",
  test: "Test helpers and libraries",
  manage: "Tools or applications to manage your MongoDB's",
  queue: "Queue libraries using MongoDB",
  logging: "Logging libraries or applications",
  monitoring: "Monitoring applications or libraries",
  framework: "General frameworks over MongoDB",
  translation: "Translation libraries or frameworks",
  analytics: "Libraries or Applications for analytics",
  connect: "Libraries for the connect middleware",
  continuosintegration: "Libraries or applications for continous integration",
  example: "Exampe applications"
}

// Create the github documents
docs.generateGithubPackageList(inputFile, outputDirectoryGithub, templates, tagDescriptions, {});




