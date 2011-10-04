#include <assert.h>
#include <string.h>
#include <stdlib.h>
#include <v8.h>
#include <node.h>
#include <node_buffer.h>
#include <cstring>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>

#include "minkey.h"

static Handle<Value> VException(const char *msg) {
  HandleScope scope;
  return ThrowException(Exception::Error(String::New(msg)));
};

Persistent<FunctionTemplate> MinKey::constructor_template;

MinKey::MinKey() : ObjectWrap() {
}

MinKey::~MinKey() {
}

MinKey* MinKey::New() {
  HandleScope scope;
  
  Local<Object> obj = constructor_template->GetFunction()->NewInstance();
  MinKey *minKey = ObjectWrap::Unwrap<MinKey>(obj);  
  
  return minKey;
}

Handle<Value> MinKey::New(const Arguments &args) {
  HandleScope scope;    
  // Create code object
  MinKey *MinKey_obj = new MinKey();
  // Wrap it
  MinKey_obj->Wrap(args.This());
  // Return the object
  return args.This();    
}

void MinKey::Initialize(Handle<Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  constructor_template = Persistent<FunctionTemplate>::New(t);
  constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
  constructor_template->SetClassName(String::NewSymbol("MinKey"));
  
  // Instance methods
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "toString", ToString);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "inspect", Inspect);  

  target->Set(String::NewSymbol("MinKey"), constructor_template->GetFunction());
}

Handle<Value> MinKey::Inspect(const Arguments &args) {
  return MinKey::ToString(args);
}

Handle<Value> MinKey::ToString(const Arguments &args) {
  HandleScope scope;
  // Return the raw data  
  return Object::New()->ToString();
}









