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

#include "objectid.h"

static Handle<Value> VException(const char *msg) {
    HandleScope scope;
    return ThrowException(Exception::Error(String::New(msg)));
  };

Persistent<FunctionTemplate> ObjectID::constructor_template;

ObjectID::ObjectID(char *oid) : ObjectWrap() {
  this->oid = oid;
}

ObjectID::~ObjectID() {}

Handle<Value> ObjectID::New(const Arguments &args) {
  HandleScope scope;
  
  // Ensure we have correct parameters passed in
  if(args.Length() != 1 && !args[0]->IsString()) {
    return VException("Argument passed in must be a single String of 24 bytes in hex format");
  }

  // Convert the argument to a String
  Local<String> oid_string = args[0]->ToString();  
  if(oid_string->Length() != 24) {
    return VException("Argument passed in must be a single String of 24 bytes in hex format");
  }
  
  // Unpack the String object to char*
  char *oid_string_c = (char *)malloc(25);
  node::DecodeWrite(oid_string_c, 25, oid_string, node::BINARY);
  
  // Instantiate a ObjectID object
  ObjectID *oid = new ObjectID(oid_string_c);
  // Wrap it
  oid->Wrap(args.This());
  // Return the object
  return args.This();
}

void ObjectID::Initialize(Handle<Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  constructor_template = Persistent<FunctionTemplate>::New(t);
  constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
  constructor_template->SetClassName(String::NewSymbol("ObjectID"));
  
  // Instance methods
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "toString", ToString);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "inspect", Inspect);  

  target->Set(String::NewSymbol("ObjectID"), constructor_template->GetFunction());
}


Handle<Value> ObjectID::Inspect(const Arguments &args) {
  HandleScope scope;
  
  return String::New("ObjectID::Inspect");
}

Handle<Value> ObjectID::ToString(const Arguments &args) {
  HandleScope scope;

  // Unpack the ObjectID instance
  ObjectID *oid = ObjectWrap::Unwrap<ObjectID>(args.This());  
  // Return the id
  return String::New(oid->oid);
}









