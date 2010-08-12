#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <v8.h>
#include <node.h>
#include <node_events.h>
#include <node_buffer.h>
#include <cstring>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>

#include "dbref.h"

static Handle<Value> VException(const char *msg) {
    HandleScope scope;
    return ThrowException(Exception::Error(String::New(msg)));
  };

Persistent<FunctionTemplate> DBRef::constructor_template;

DBRef::DBRef(char *ref, ObjectID *oid, char *db) : ObjectWrap() {
  this->ref = ref;
  this->oid = oid;
  this->db = db;
}

DBRef::~DBRef() {}

Handle<Value> DBRef::New(const Arguments &args) {
  HandleScope scope;
  
  // Ensure we have the parameters needed
  if(args.Length() != 3) return VException("3 String arguments are needed, $ref, $id, $db");
  
  // Unpack the values and create the associated objects
  Local<String> ref = args[0]->ToString();
  Local<String> id = args[1]->ToString();
  Local<String> db = args[2]->ToString();
  
  // Unpack the variables as char*
  char *ref_data = (char *)malloc(ref->Length() + 1);
  node::DecodeWrite(ref_data, ref->Length(), ref, node::BINARY);
  *(ref_data + ref->Length()) = '\0';

  char *id_data = (char *)malloc(id->Length() + 1);
  node::DecodeWrite(id_data, id->Length(), id, node::BINARY);
  *(id_data + id->Length()) = '\0';

  char *db_data = (char *)malloc(db->Length() + 1);
  node::DecodeWrite(db_data, db->Length(), db, node::BINARY);
  *(db_data + db->Length()) = '\0';

  // printf("================================================ ref_data: %s\n", ref_data);
  // printf("================================================ id_data: %s\n", id_data);
  // printf("================================================ db_data: %s\n", db_data);

  // Initialize the objectid
  ObjectID *oid = new ObjectID(id_data);    
  // Create a db ref object
  DBRef *dbref = new DBRef(ref_data, oid, db_data);
  // Return the reference object
  dbref->Wrap(args.This());
  // Return the object
  return args.This();
}

static Persistent<String> namespace_symbol;
static Persistent<String> oid_symbol;
static Persistent<String> db_symbol;
static Persistent<String> id_symbol;

void DBRef::Initialize(Handle<Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  constructor_template = Persistent<FunctionTemplate>::New(t);
  constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
  constructor_template->SetClassName(String::NewSymbol("DBRef"));

  // Propertry symbols
  namespace_symbol = NODE_PSYMBOL("namespace");
  oid_symbol = NODE_PSYMBOL("oid");
  db_symbol = NODE_PSYMBOL("db");
  id_symbol = NODE_PSYMBOL("id");

  // Getters for correct serialization of the object  
  constructor_template->InstanceTemplate()->SetAccessor(namespace_symbol, NamespaceGetter, NamespaceSetter);
  constructor_template->InstanceTemplate()->SetAccessor(oid_symbol, OidGetter, OidSetter);
  constructor_template->InstanceTemplate()->SetAccessor(db_symbol, DbGetter, DbSetter);
  constructor_template->InstanceTemplate()->SetAccessor(id_symbol, IdGetter, IdSetter);
  
  // Instance methods
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "toString", ToString);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "inspect", Inspect);  

  target->Set(String::NewSymbol("DBRef"), constructor_template->GetFunction());
}

// id setter/getter
Handle<Value> DBRef::IdGetter(Local<String> property, const AccessorInfo& info) {
  HandleScope scope;

  Local<Object> self = info.Holder();
  // Fetch external reference (reference to DBRef object)
  Local<External> wrap = Local<External>::Cast(self->GetInternalField(0));
  // Get pointer to the object
  void *ptr = wrap->Value();
  // Char value
  DBRef *dbref = static_cast<DBRef *>(ptr);
  // ObjectID
  char *oid = dbref->oid->convert_hex_oid_to_bin();
  // Retrieve the object id
  Local<String> oid_str = Encode(oid, 12, BINARY)->ToString();
  return oid_str;

  // // Initialize the values
  // Local<String> oid_str = Encode(dbref->oid, strlen(dbref->oid), BINARY)->ToString();
  // 
  // // Return the value  
  // Local<Value> argv[] = {oid_str};
  // Handle<Value> object_id_obj = ObjectID::constructor_template->GetFunction()->NewInstance(1, argv);

  
  // Local<Object> self = info.Holder();
  // // Fetch external reference (reference to DBRef object)
  // Local<External> wrap = Local<External>::Cast(self->GetInternalField(0));
  // // Get pointer to the object
  // void *ptr = wrap->Value();
  // // Char value
  // char *value = static_cast<DBRef *>(ptr)->ref;
  // // Return the value  
  // return scope.Close(String::New(value));
}

void DBRef::IdSetter(Local<String> property, Local<Value> value, const AccessorInfo& info) {
  HandleScope scope;
}

// Namespace setter/getter
Handle<Value> DBRef::NamespaceGetter(Local<String> property, const AccessorInfo& info) {
  HandleScope scope;
  
  Local<Object> self = info.Holder();
  // Fetch external reference (reference to DBRef object)
  Local<External> wrap = Local<External>::Cast(self->GetInternalField(0));
  // Get pointer to the object
  void *ptr = wrap->Value();
  // Char value
  char *value = static_cast<DBRef *>(ptr)->ref;
  // Return the value  
  return scope.Close(String::New(value));
}

void DBRef::NamespaceSetter(Local<String> property, Local<Value> value, const AccessorInfo& info) {
  HandleScope scope;
}

// oid setter/getter
Handle<Value> DBRef::OidGetter(Local<String> property, const AccessorInfo& info) {
  HandleScope scope;
  
  Local<Object> self = info.Holder();
  // Fetch external reference (reference to DBRef object)
  Local<External> wrap = Local<External>::Cast(self->GetInternalField(0));
  // Get pointer to the object
  void *ptr = wrap->Value();
  // Char value
  DBRef *dbref = static_cast<DBRef *>(ptr);
  // Initialize the values
  Local<String> oid_str = String::New(dbref->oid->oid);
  // Return the value  
  Local<Value> argv[] = {oid_str};
  Handle<Value> object_id_obj = ObjectID::constructor_template->GetFunction()->NewInstance(1, argv);
  // Return the oid
  return scope.Close(object_id_obj);
}

void DBRef::OidSetter(Local<String> property, Local<Value> value, const AccessorInfo& info) {
  HandleScope scope;
}

// db setter/getter
Handle<Value> DBRef::DbGetter(Local<String> property, const AccessorInfo& info) {
  HandleScope scope;
  
  Local<Object> self = info.Holder();
  // Fetch external reference (reference to DBRef object)
  Local<External> wrap = Local<External>::Cast(self->GetInternalField(0));
  // Get pointer to the object
  void *ptr = wrap->Value();
  // Char value
  char *value = static_cast<DBRef *>(ptr)->db;
  // Return the value  
  return scope.Close(String::New(value));
}

void DBRef::DbSetter(Local<String> property, Local<Value> value, const AccessorInfo& info) {
  HandleScope scope;
}

Handle<Value> DBRef::Inspect(const Arguments &args) {
  HandleScope scope;
  
  // // Unpack the ObjectID instance
  // ObjectID *oid = ObjectWrap::Unwrap<ObjectID>(args.This());  
  // Return the id
  return String::New("DBRef::Inspect");
}

Handle<Value> DBRef::ToString(const Arguments &args) {
  HandleScope scope;

  // // Unpack the ObjectID instance
  // ObjectID *oid = ObjectWrap::Unwrap<ObjectID>(args.This());  
  // Return the id
  return String::New("DBRef::ToString");
}









