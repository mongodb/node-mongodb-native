+++
date = "2015-03-19T14:27:51-04:00"
title = "Extended JSON"
[menu.main]
  parent = "BSON"
  weight = 50
  pre = "<i class='fa'></i>"
+++

## MongoDB Extended JSON

As discussed earlier, the Java driver supports reading and writing BSON documents represented as  
[MongoDB Extended JSON](http://docs.mongodb.org/manual/reference/mongodb-extended-json/).  Both variants are supported: 

- Strict Mode: representations of BSON types that conform to the [JSON RFC](http://www.json.org/). This is the 
format that [mongoexport](http://docs.mongodb.org/manual/reference/program/mongoexport/) produces and 
[mongoimport](http://docs.mongodb.org/manual/reference/program/mongoimport/) consumes.
- Shell Mode: a superset of JSON that the 
[MongoDB shell](http://docs.mongodb.org/manual/tutorial/getting-started-with-the-mongo-shell/) can parse. 

Furthermore, the `Document` class provides two sets of convenience methods for this purpose:

- toJson(): a set of overloaded methods that convert a `Document` instance to a JSON string
- parse(): a set of overloaded static factory methods that convert a JSON string to a `Document` instance
 
## Writing JSON

Consider the task of implementing a [mongoexport](http://docs.mongodb.org/manual/reference/program/mongoexport/)-like tool using the 
Java driver.  
    
```java
String outputFilename;                 // initialize to the path of the file to write to
MongoCollection<Document> collection;  // initialize to the collection from which you want to query

BufferedWriter writer = new BufferedWriter(new FileWriter(outputFilename));

try {
    for (Document doc : collection.find()) {
        writer.write(doc.toJson());
        writer.newLine();
} finally {
   writer.close();
}
```

The `Document.toJson()` method constructs an instance of a `JsonWriter` with its default settings, which will write in strict mode with 
no new lines or indentation.  

You can override this default behavior by using one of the overloads of `toJson()`.  As an example, consider the task of writing a
 JSON string that can be copied and pasted into the MongoDB shell:
 
```java
SimpleDateFormat fmt = new SimpleDateFormat("dd/MM/yy");
Date first = fmt.parse("01/01/2014");
Date second = fmt.parse("01/01/2015");
Document doc = new Document("startDate", new Document("$gt", first).append("$lt", second)); 
System.out.println(doc.toJson(new JsonWriterSettings(JsonMode.SHELL))); 
```

This code snippet will print out MongoDB shell-compatible JSON, which can then be pasted into the shell:
 
```javascript
{ "startDate" : { "$gt" : ISODate("2014-01-01T05:00:00.000Z"), "$lt" : ISODate("2015-01-01T05:00:00.000Z") } }
```

## Reading JSON

Consider the task of implementing a [mongoimport](http://docs.mongodb.org/manual/reference/program/mongoimport/)-like tool using the 
Java driver.  
    
```java
String inputFilename;                  // initialize to the path of the file to read from
MongoCollection<Document> collection;  // initialize to the collection to which you want to write

BufferedReader reader = new BufferedReader(new FileReader(inputFilename));

try {
    String json;

    while ((json = reader.readLine()) != null) {
        collection.insertOne(Document.parse(json));
    } 
} finally {
    reader.close();
}
```

The `Document.parse()` static factory method constructs an instance of a `JsonReader` with the given string and returns an instance of an
equivalent Document instance. `JsonReader` automatically detects the JSON flavor in the string, so you do not need to specify it. 

 



