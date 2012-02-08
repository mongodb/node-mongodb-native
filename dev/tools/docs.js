var fs = require('fs'),
  dox = require('dox'),
  parseJS = require('uglify-js').parser,
  ejs = require('ejs'),
  exec = require('child_process').exec,
  markdown = require('markdown').markdown,
  format = require('util').format;

// -----------------------------------------------------------------------------------------------------
//
//  Markdown converter
//
// -----------------------------------------------------------------------------------------------------

// Parse markdown to Rich text format
var transformMarkdownToStructuredText = exports.transformMarkdownToStructuredText = function(markDownText) {
  // Parse the md file and generate a json tree
  var jsonTree = markdown.parse(markDownText);
  var documentLines = [];
  return convert_tree_to_rs(jsonTree, documentLines).join('\n');
}

var addLine = function(char, length) {
  var chars = [];  
  for(var i = 0; i < length; i++) chars[i] = char;
  return chars.join('');
}

var convert_tree_to_rs = function(nodes, documentLines) {
  if(!Array.isArray(nodes)) throw new Error("Malformed tree structure");
  // Go through all the tags and render
  for(var i = 0; i < nodes.length; i++) {
    var line = nodes[i];
    // console.dir(line)
    
    if(Array.isArray(line)) {
      switch(line[0]) {
        case 'header':
          // Unpack the parts
          var options = line[1];
          var title = line[2];
          // Add lines to the document
          if(options.level == 1) {
            documentLines.push(addLine("=", title.length))
            documentLines.push(title);
            documentLines.push(addLine("=", title.length))
          } else if(options.level == 2) {
            documentLines.push(addLine("-", title.length))
            documentLines.push(title);
            documentLines.push(addLine("-", title.length))
          }
          break;
        case 'para':
          var paraLines = [];
          paraLines.push("\n");
        
          for(var j = 1; j < line.length; j++) {
            // bullet list item
            if(Array.isArray(line[j])) {
              var subdocs = [];
              convert_tree_to_rs([line[j]], subdocs);
              paraLines.push(subdocs.join(''));
            } else {
              paraLines.push(line[j]);
            }
          }          
        
          // Merge the docs in
          documentLines.push(paraLines.join(' '));
          documentLines.push('\n');
          break;
        case 'link':
          documentLines.push(format("`%s <%s>`_", line[2], line[1].href.replace(".md", ".html")));
          break;
        case 'inlinecode':
          documentLines.push(format("``%s``", line[1]));
          break;
        case 'code_block':
          // Unpack code block
          var codeLines = line[1].split("\n");
          // Format all the lines
          documentLines.push("  .. code-block:: javascript\n");
          for(var j = 0; j < codeLines.length; j++) {
            documentLines.push(format("    %s", codeLines[j]));
          }
          
          documentLines.push("\n");
          break;
        case 'bulletlist':
          // Render the list (line.length - 1)
          for(var j = 1; j < line.length; j++) {
            // bullet list item
            if(Array.isArray(line[j])) {
              var subdocs = [];
              convert_tree_to_rs([line[j]], subdocs);
              documentLines.push(subdocs.join(' '));
            } else {
              documentLines.push(line[j]);
            }
          }
          
          // Add an empty line
          documentLines.push("\n");          
          break;
        case 'listitem':
          var listitemLines = [];
          
          for(var j = 1; j < line.length; j++) {
            // bullet list item
            if(Array.isArray(line[j])) {
              var subdocs = [];
              convert_tree_to_rs([line[j]], subdocs);
              listitemLines.push(subdocs.join(' '));
            } else {
              listitemLines.push(line[j]);
            }
          }          
          
          // Merge the docs in
          documentLines.push(format("  * %s", listitemLines.join(' ').trim()));
          break;
        case 'em':
          documentLines.push(format("*%s*", line[1]));
          break;
        case 'strong':
          documentLines.push(format("**%s**", line[1]));
          break;
        default:
          console.dir(line)
          break;
      }      
    }    
  }
  
  return documentLines;
}

exports.writeMarkDownFile = function(outputDirectory, articles, templates, options) {
  // Force create the directory for the generated docs
  exec('rm -rf ' + outputDirectory, function (error, stdout, stderr) {});
  exec('mkdir ' + outputDirectory, function (error, stdout, stderr) {});

  // Contains all the names for the index
  var names = [];

  // Process all the articles
  for(var i = 0 ; i < articles.length; i++) {
    // Fetch the article markdown content
    var article = fs.readFileSync(articles[i].path).toString();
    // Convert the text into restructured text for sphinx
    var text = transformMarkdownToStructuredText(article);
    // Write out the content
    fs.writeFileSync(format("%s/%s", outputDirectory, articles[i].output.toLowerCase()), text);
    names.push(articles[i].name.toLowerCase());
  }

  // Just write out the index
  var indexContent = ejs.render(templates[options.template], {entries:names, format:format, title:options.title});    
  fs.writeFileSync(format("%s/%s", outputDirectory, 'index.rst'), indexContent);  
}

// -----------------------------------------------------------------------------------------------------
//
//  API Doc generation
//
// -----------------------------------------------------------------------------------------------------
// Parses all the files and extracts the dox data for the library
exports.extractLibraryMetaData = function(sourceFiles) {
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
exports.buildTestHash = function(objects) {
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

// Render all the templates
exports.renderAllTemplates = function(outputDirectory, templates, dataObjects, testObjects, attributeTags) {
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
    // Write out the content to disk
    fs.writeFileSync(format("%s/%s.rst", outputDirectory, className), classContent);
  }
  
  // Let's render the index api file
  var indexContent = ejs.render(templates['index'], 
    {entries:classNames, isClass:isClass, isFunction:isFunction, isProperty:isProperty, 
      isClassConstant:isClassConstant, format:format, title:attributeTags['index_title']});    
  // Write out the api index to disk
  fs.writeFileSync(format("%s/%s.rst", outputDirectory, "index"), indexContent);
}

// Read all the templates
exports.readAllTemplates = function(templates) {
  var finishedTemplates = {};
  // Read in all the templates
  for(var i = 0; i < templates.length; i++) {
    finishedTemplates[templates[i].tag] = fs.readFileSync(templates[i].path).toString();
  }
  
  // Return the finished templates
  return finishedTemplates;
}
