var fs = require('fs'),
  dox = require('dox'),
  parseJS = require('uglify-js').parser,
  ejs = require('ejs'),
  exec = require('child_process').exec,
  format = require('util').format;

// Parses all the files and extracts the dox data for the library
var extractLibraryMetaData = function(sourceFiles) {
  var dataObjects = {};
  // Iterate over all source files
  for(var i = 0; i < sourceFiles.length; i++) {
    // Read source file content
    var sourceFile = fs.readFileSync(sourceFiles[i].path);
    // Parse the content
    var metaData = dox.parseComments(sourceFile.toString());
    // Save the metadata
    dataObjects[sourceFiles[i]["tag"] != null ? sourceFiles[i].tag : i] = metaData;
  }
  
  // Return all objects
  return dataObjects;
}

// Build a hash to easy access to the objects
var buildTestHash = function(objects) {
  // Organize the objects by class-function so we can query them
  var objectsByClassAndMethod = {};
  var objectKeys = Object.keys(objects);
  
  // Get all the objects
  for(var i = 0; i < objectKeys.length; i++) {
    // Get the object with the metadata
    var object = objects[objectKeys[i]];
    // Go through each example and pull them out
    for(var j = 0; j < object.length; j++) {
      var block = object[j];
      var tags = block.tags;

      // Build a class type
      var tagObject = {};
      
      // Check for the _class tag
      for(var tagIndex = 0; tagIndex < tags.length; tagIndex++) {
        // Get the tag
        var tag = tags[tagIndex];
        // Grab the tag if it's got it
        if(tag['type'] != null && tag['string'] != null) {
          tagObject[tag['type']] = tag['string'];
        }
      }
      
      // Check if we have the tags _class and _function signaling a test
      if(tagObject['_class'] != null && tagObject['_function'] != null) {
        // Add a class reference if none exists
        if(objectsByClassAndMethod[tagObject['_class']] == null) {
          objectsByClassAndMethod[tagObject['_class']] = {};
        }
        
        // Add a method reference if none exists
        if(objectsByClassAndMethod[tagObject['_class']][tagObject['_function']] == null) {
          objectsByClassAndMethod[tagObject['_class']][tagObject['_function']] = [];
        }

        // console.log("------------------------------------------------------------")
        // console.dir(objectsByClassAndMethod[tagObject['_class']][tagObject['_function']])
        // console.dir(typeof block)
        
        // Push the object on the list
        objectsByClassAndMethod[tagObject['_class']][tagObject['_function']].push(block);          
        
        // Format the block code
        var codeLines = block.code.split(/\n/);
        // Drop first and last line
        codeLines = codeLines.slice(1, codeLines.length - 1);
        // Indent the code
        for(var k = 0; k < codeLines.length; k++) {
          codeLines[k] = codeLines[k].replace(/^  /, "")
        }
        // Reasign the code block
        block.code = codeLines.join("\n");
      }
    }
  }
  
  // Return the object mapped by _class and _function
  return objectsByClassAndMethod;
}

// Read all the templates
var readAllTemplates = function(templates) {
  var finishedTemplates = {};
  // Read in all the templates
  for(var i = 0; i < templates.length; i++) {
    finishedTemplates[templates[i].tag] = fs.readFileSync(templates[i].path).toString();
  }
  
  // Return the finished templates
  return finishedTemplates;
}

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
    {tag:"grid", path:"./lib/mongodb/gridfs/grid.js"},
    {tag:"objectid", path:"./lib/mongodb/bson/objectid.js"},
    {tag:"binary", path:"./lib/mongodb/bson/binary.js"},
    {tag:"code", path:"./lib/mongodb/bson/code.js"},
    {tag:"code", path:"./lib/mongodb/bson/db_ref.js"},
    {tag:"double", path:"./lib/mongodb/bson/double.js"},
    {tag:"maxkey", path:"./lib/mongodb/bson/max_key.js"},
    {tag:"symbol", path:"./lib/mongodb/bson/symbol.js"},
    {tag:"timestamp", path:"./lib/mongodb/bson/timestamp.js"},
    {tag:"long", path:"./lib/mongodb/bson/long.js"}
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
    {path:"./test/bson_types_test.js"}
  ]

// Read all the templates
var templates = [
  {tag:'index', path:'./dev/tools/doc-templates/index.ejs'},
  {tag:'class', path:'./dev/tools/doc-templates/class.ejs'},
  {tag:'function', path:'./dev/tools/doc-templates/function.ejs'}
]

// Output directory
var outputDirectory = "./docs/sphinx-docs/source/api-generated"

// Force create the directory for the generated docs
exec('rm -rf ' + outputDirectory, function (error, stdout, stderr) {});
exec('mkdir ' + outputDirectory, function (error, stdout, stderr) {});

// ----------------------------------------------------------------------------
// PROCESS
// ----------------------------------------------------------------------------
// Extract meta data from source files
var dataObjects = extractLibraryMetaData(apiClasses);
// Filter out and prepare the test Objects hash
var testObjects = buildTestHash(extractLibraryMetaData(testClasses));
// Read all the templates
var templates = readAllTemplates(templates);

// Render all the templates
var renderAllTemplates = function(outputDirectory, templates, dataObjects, testObjects) {
  // Helper methods used in the rendering
  var isClass = function(tags) {    
    for(var k = 0; k < tags.length; k++) {
      if(tags[k].type == 'class') return true;
    }    
    return false;
  }
  
  var isFunction = function(entry) {
    return entry.ctx != null && entry.ctx.type == 'method' && entry.isPrivate == false;
  }
  
  var isProperty = function(entry) {
    var tags = entry.tags;    
    for(var k = 0; k < tags.length; k++) {
      if(tags[k].type == 'property') return true;
    }    
    return false;    
  }
  
  var isClassConstant = function(entry) {
    var tags = entry.tags;    
    for(var k = 0; k < tags.length; k++) {
      if(tags[k].type == 'classconstant') return true;
    }    
    return false;    
  }
  
  // Iterate over all classes
  var classNames = Object.keys(dataObjects);
  
  // For each class generate output
  for(var i = 0; i < classNames.length; i++) {
    var className = classNames[i];
    // The meta data object
    var classMetaData = dataObjects[className];
    // Grab the examples for this Metadata class
    var classExamplesData = testObjects[className];
    // Render the class template
    var classContent = ejs.render(templates['class'], 
      {entries:classMetaData, examples:classExamplesData, isClass:isClass, 
        isFunction:isFunction, isProperty:isProperty, isClassConstant:isClassConstant, 
        format:format});    
    
    console.log("======================================================== " + className)
    console.log(classContent)
    
    // Write out the content to disk
    fs.writeFileSync(format("%s/%s.rst", outputDirectory, className), classContent);
  }
  
  // Let's render the index api file
  var indexContent = ejs.render(templates['index'], 
    {entries:classNames, isClass:isClass, isFunction:isFunction, isProperty:isProperty, 
      isClassConstant:isClassConstant, format:format});    
  // Write out the api index to disk
  fs.writeFileSync(format("%s/%s.rst", outputDirectory, "index"), indexContent);
}

// Render all the classes that are decorated
renderAllTemplates(outputDirectory, templates, dataObjects, testObjects);


