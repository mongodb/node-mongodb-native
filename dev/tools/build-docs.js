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
    {tag:"db", path:"./lib/mongodb/db.js"},
    {tag:"cursor", path:"./lib/mongodb/cursor.js"},
    {tag:"cursorstream", path:"./lib/mongodb/cursorstream.js"},
    {tag:"gridstore", path:"./lib/mongodb/gridfs/gridstore.js"},
    {tag:"readstream", path:"./lib/mongodb/gridfs/readstream.js"},
    {tag:"grid", path:"./lib/mongodb/gridfs/grid.js"}
  ];
  
// All test files 
var testClasses = [
    {path:"./test/admin_test.js"},
    {path:"./test/objectid_test.js"},
    {path:"./test/insert_test.js"},
    {path:"./test/remove_test.js"},
    {path:"./test/collection_test.js"},
    {path:"./test/db_test.js"},
    {path:"./test/find_test.js"},
    {path:"./test/map_reduce_test.js"},
    {path:"./test/index_test.js"},
    {path:"./test/geo_search_test.js"},
    {path:"./test/replicaset/connect_test.js"},
    {path:"./test/connect_test.js"},
    {path:"./test/multiple_dbs_on_connection_pool_test.js"},
    {path:"./test/cursor_test.js"},
    {path:"./test/cursorstream_test.js"},
    {path:"./test/gridstore/grid_store_test.js"},
    {path:"./test/gridstore/grid_store_file_test.js"},
    {path:"./test/gridstore/grid_store_stream_test.js"},
    {path:"./test/gridstore/readstream_test.js"},
    {path:"./test/gridstore/grid_test.js"},
    {path:"./test/bson_types_test.js"},
    {path:"./test/bson/bson_test.js"}
  ]

// Read all the templates
var templates = [
  {tag:'index', path:'./dev/tools/doc-templates/index.ejs'},
  {tag:'changelog', path:'./dev/tools/doc-templates/changelog.ejs'},
  {tag:'index_no_header', path:'./dev/tools/doc-templates/index_no_header.ejs'},
  {tag:'class', path:'./dev/tools/doc-templates/class.ejs'},
  {tag:'function', path:'./dev/tools/doc-templates/function.ejs'}
]

// Output directory
var outputDirectory = "./docs/sphinx-docs/source/api-generated"

// Force create the directory for the generated docs
exec('rm -rf ' + outputDirectory, function (error, stdout, stderr) {});
exec('mkdir ' + outputDirectory, function (error, stdout, stderr) {});

// ----------------------------------------------------------------------------
// PROCESS Driver API
// ----------------------------------------------------------------------------
// Extract meta data from source files
var dataObjects = docs.extractLibraryMetaData(apiClasses);
// Filter out and prepare the test Objects hash
var testObjects = docs.buildTestHash(docs.extractLibraryMetaData(testClasses));
// Read all the templates
var templates = docs.readAllTemplates(templates);
// Render all the classes that are decorated
docs.renderAllTemplates(outputDirectory, templates, dataObjects, testObjects, {index_title:'Driver API'});

// ----------------------------------------------------------------------------
// PROCESS BSON API
// ----------------------------------------------------------------------------
// Output directory
var outputDirectory2 = "./docs/sphinx-docs/source/api-bson-generated"
// Force create the directory for the generated docs
exec('rm -rf ' + outputDirectory2, function (error, stdout, stderr) {});
exec('mkdir ' + outputDirectory2, function (error, stdout, stderr) {});

var apiClasses2 = [
    {tag:"objectid", path:"./lib/mongodb/bson/objectid.js"},
    {tag:"binary", path:"./lib/mongodb/bson/binary.js"},
    {tag:"code", path:"./lib/mongodb/bson/code.js"},
    {tag:"code", path:"./lib/mongodb/bson/db_ref.js"},
    {tag:"double", path:"./lib/mongodb/bson/double.js"},
    {tag:"minkey", path:"./lib/mongodb/bson/min_key.js"},
    {tag:"maxkey", path:"./lib/mongodb/bson/max_key.js"},
    {tag:"symbol", path:"./lib/mongodb/bson/symbol.js"},
    {tag:"timestamp", path:"./lib/mongodb/bson/timestamp.js"},
    {tag:"long", path:"./lib/mongodb/bson/long.js"},
    {tag:"bson", path:"./lib/mongodb/bson/bson.js"}
  ];

// Read all the templates
var templates2 = [
  {tag:'index', path:'./dev/tools/doc-templates/index.ejs'},
  {tag:'changelog', path:'./dev/tools/doc-templates/changelog.ejs'},
  {tag:'index_no_header', path:'./dev/tools/doc-templates/index_no_header.ejs'},
  {tag:'class', path:'./dev/tools/doc-templates/class.ejs'},
  {tag:'function', path:'./dev/tools/doc-templates/function.ejs'}
]

// Extract meta data from source files
var dataObjects2 = docs.extractLibraryMetaData(apiClasses2);
// Filter out and prepare the test Objects hash
var testObjects2 = docs.buildTestHash(docs.extractLibraryMetaData(testClasses));
// Render all the classes that are decorated
docs.renderAllTemplates(outputDirectory2, templates, dataObjects2, testObjects2, {index_title:'Binary JSON API'});

// ----------------------------------------------------------------------------
// PROCESS MARKDOWN DOCUMENTS TO STRUCTURED TEXT
// ----------------------------------------------------------------------------

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
    {name:"database", output:"database.rst", path:"./docs/database.md"},
    {name:"gridfs", output:"gridfs.rst", path:"./docs/gridfs.md"},
    {name:"indexes", output:"indexes.rst", path:"./docs/indexes.md"},
    {name:"insert", output:"insert.rst", path:"./docs/insert.md"},
    {name:"queries", output:"queries.rst", path:"./docs/queries.md"},
    {name:"replicaset", output:"replicaset.rst", path:"./docs/replicaset.md"},
  ];
// Tranform the markdown to restructured text
docs.writeMarkDownFile("./docs/sphinx-docs/source/markdown-docs", articles, templates, 
  {title:'Using the driver', template:'index_no_header'});

// ----------------------------------------------------------------------------
// WRITE CHANGELOG TO THE DOCUMENTATION
// ----------------------------------------------------------------------------

// Outputdiectory
var outputDirectory = "./docs/sphinx-docs/source/changelog";
// Force create the directory for the generated docs
exec('rm -rf ' + outputDirectory, function (error, stdout, stderr) {});
exec('mkdir ' + outputDirectory, function (error, stdout, stderr) {
  // Read the changelog
  var changelog = fs.readFileSync('./HISTORY').toString();
  // Just write out the index
  var content = ejs.render(templates["changelog"], {content:changelog});    
  // Write it out
  fs.writeFileSync(format("%s/changelog.rst", outputDirectory), content);  
});


