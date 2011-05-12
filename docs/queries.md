Queries
=======

See also:

  * [Database](database.md)
  * [Collections](collections.md)

## Making queries with `find`

[Collections](collections.md) can be queried with `find`. 

    collection.find(query[[[, fields], options], callback]);

Where

  * `query` - is a query object, defining the conditions the documents need to apply 
  * `fields` - indicates which fields should be included in the response (default is all)
  * `options` - defines extra logic (sorting options, paging etc.)
  
The result for the query is actually a cursor object. This can be used directly or converted to an array.

To indicate which fields must or must no be returned `fields` value can be used. For example the following `fields` value

    {
        "name": true,
        "title": true
    }

retrieves fields `name` and `title` (and as a default: `_id`) but not any others.

## Query object

The simplest query object is an empty one `{}` which matches every record in the database.

To make a simple query where one field must match to a defined value, one can do it as simply as

    {fieldname: "fieldvalue"}  

This query matches all the records that a) have fields called *fieldname* and b) its value is *"fieldvalue"*.

For example if we have a collection of blog posts where the structure of the 
records is `{title, author, contents}` and we want 
to retrieve all the posts for a specific author then we can do it like this:

    posts = pointer_to_collection;
    posts.find({author:"Daniel"}).toArray(function(err, results){
        console.log(results); // output all records
    });

If the queried field is inside an object then that can be queried also. For example if we have a record with the following structure:

    {
        user: {
            name: "Daniel"
        }
    }

Then we can query the "name" field like this: `{"user.name":"Daniel"}`

### AND

If more than one fieldname is specified, then it's an AND query

    {
        key1: "value1",
        name2: "value2"
    }

Whis query matches all records where *key1* is *"value1"* and  *key2* is *"value2"*

### OR

OR queries are a bit trickier but doable with the `$or` operator. Query operator takes an array which includes
a set of query objects and at least one of these must match a document before it is retrieved

    {
        $or:[
            {author:"Daniel"},
            {author:"Jessica"}
        ]
    }

This query match all the documents where author is Daniel or Jessica.

To mix AND and OR queries, you just need to use $or as one of regular query fields.

    {
        title:"MongoDB", 
        $or:[
            {author:"Daniel"}, 
            {author:"Jessica"}
        ]
    }

### Conditionals

Conditional operators `<`, `<=`, `>`, `>=` and `!=` can't be used directly, as the query object format doesn't support it but the same
can be achieved with their aliases `$lt`, `$lte`, `$gt`, `$gte` and `$ne`. When a field value needs to match a conditional, the value
must be wrapped into a separate object.

    {"fieldname":{$gte:100}}

This query defines that *fieldname* must be greater than or equal to `100`.

Conditionals can also be mixed to create ranges.

    {"fieldname": {$lte:10, $gte:100}} 

### Regular expressions in queries

Queried field values can also be matched with regular expressions

    {author:/^Daniel/}

### Special query operators

In addition to OR and conditional operators there's even more

  * `$in` - specifies an array of possible matches, `{"name":{$in:[1,2,3]}}`
  * `$nin` - specifies an array of unwanted matches
  * `$all` - array value must match to the condition `{"name":{$all:[1,2,3]}}`
  * `$exists` - checks for existence of a field `{"name":{$exists:true}}`
  * `$mod` - check for a modulo `{"name":{$mod:{3,2}}` is the same as `"name" % 3 == 2`
  * `$size` - checks the size of an array value `{"name": {$size:2}}` matches arrays *name* with 2 elements


## Query options

Query options define the behavior of the query. For example the following `options` value

    {
        "limit": 20
    }

### Paging

Paging can be achieved with option parameters `limit` and `skip`

    {
        "limit": 20,
        "skip" 10
    }

retrieves 10 elements starting from 20

### Sorting

Sorting can be acieved with option parameter `sort` which takes an array of sort preferences

    {
        "sort": [['field1','asc'], ['field2','desc']]
    }

With single ascending field the array can be replaced with the name of the field.

    {
        "sort": "name"
    }

### Explain

Option parameter `explain` turns the query into an explain query.

## Cursors

Cursor objects are the results for queries and can be used to fetch individual fields from the database.

### nextObject

`cursor.nextObject(function(err, doc){})` retrieves the next record from database. If doc is null, then there weren't any more records.

### each

`cursor.each(function(err, doc){})` retrieves all matching records one by one.

### toArray

`cursor.toArray(function(err, docs){})` converts the cursor object into an array of all the matching records. Probably the 
most convenient way to retrieve results but be careful with large datasets as every record is loaded into memory. 

    collection.find().toArray(function(err, docs){
        console.log("retrieved records:");
        console.log(docs);
    });

### rewind

`cursor.rewind()` resets the internal pointer in the cursor to the beginning.    
    