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
    {tag:"objectid", path:"./lib/mongodb/bson/objectid.js"}
  ];
  
// All test files 
var testClasses = [
    {path:"./test/admin_test.js"}
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
        isFunction:isFunction, isProperty:isProperty, format:format});    
    
    // console.dir("------------------------------------------------------------------- -1")
    // console.dir(templates)
    // console.dir("------------------------------------------------------------------- 0")
    // for(var j = 0; j < classMetaData.length; j++) {
    //   console.dir(classMetaData[j]);
    // }
    // console.dir(classMetaData)
    console.dir("------------------------------------------------------------------- -1")
    console.dir("------------------------------------------------------------------- -1")
    console.dir("------------------------------------------------------------------- -1")
    console.log(classContent)
    
    // Write out the content to disk
    fs.writeFileSync(format("%s/%s.rst", outputDirectory, className), classContent);
    
    // console.dir("------------------------------------------------------------------- 1")
    // console.dir(classExamplesData)
  }
  
  // Let's render the index api file
  var indexContent = ejs.render(templates['index'], 
    {entries:classNames, isClass:isClass, isFunction:isFunction, isProperty:isProperty, format:format});    
  // Write out the api index to disk
  fs.writeFileSync(format("%s/%s.rst", outputDirectory, "index"), indexContent);
  
  
  
  // console.dir(Object.keys(dataObjects))
}


// Render all the classes that are decorated
renderAllTemplates(outputDirectory, templates, dataObjects, testObjects);

// // Let's generate rendered templates for each method
// var renderedContent = ejs.render(templates.method, {});
// console.log("===========================================================================")
// console.dir(renderedContent)

// console.log(testObjects.admin.validateCollection[0].code)

// console.dir("========================================================================")
// console.dir(dataObjects)
// console.dir(require('uglify-js').parser)

// console.dir("========================================================================")
// console.dir(testObjects.admin.validateCollection[0].code)

// console.dir("==========================================================================")
// console.dir(parseJS.parse(testObjects.admin.validateCollection[0].code))
// var a = parseJS.parse(testObjects.admin.validateCollection[0].code);
// var b = parseJS.tokenizer(testObjects.admin.validateCollection[0].code);

// // console.dir("==========================================================================")
// // console.dir(b)
// // console.dir(a[1])
// 
// var keepTokens = [];
// var token = null;
// while((token = b()).type != 'eof') {
//   console.dir(token)
// }


// var docDirectory = "./build";
// // Fetch all the json objects
// var files = fs.readdirSync(docDirectory);
// // Print all json objects
// for(var i = 0; i < files.length; i++) {
//   var file = files[i];
//   
//   if(file.indexOf('.json') != -1) {
//     var jsonFile = fs.readFileSync(docDirectory + "/" + file);
//     var object = JSON.parse(jsonFile.toString());
//     console.log("====================================================== Content of :: " + file);
//     if(Array.isArray(object)) {
//       for(var i = 0; i < object.length; i++) {
//         var item = object[i];        
//         console.log("---------------------------------------------------- item");
//         console.dir(item);
//         // console.dir(item.tags)
//       }
//     }
//     // console.dir(object);
//   }
// }
