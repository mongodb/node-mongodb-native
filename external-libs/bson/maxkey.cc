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

#include "maxkey.h"

static Handle<Value> VException(const char *msg) {
  HandleScope scope;
  return ThrowException(Exception::Error(String::New(msg)));
};

Persistent<FunctionTemplate> MaxKey::constructor_template;

MaxKey::MaxKey() : ObjectWrap() {
}

MaxKey::~MaxKey() {
}

MaxKey* MaxKey::New() {
  HandleScope scope;
  
  Local<Object> obj = constructor_template->GetFunction()->NewInstance();
  MaxKey *maxKey = ObjectWrap::Unwrap<MaxKey>(obj);  
  
  return maxKey;
}

Handle<Value> MaxKey::New(const Arguments &args) {
  HandleScope scope;    
  // Create code object
  MaxKey *MaxKey_obj = new MaxKey();
  // Wrap it
  MaxKey_obj->Wrap(args.This());
  // Return the object
  return args.This();    
}

void MaxKey::Initialize(Handle<Object> target) {
  // Grab the scope of the call from Node
  HandleScope scope;
  // Define a new function template
  Local<FunctionTemplate> t = FunctionTemplate::New(New);
  constructor_template = Persistent<FunctionTemplate>::New(t);
  constructor_template->InstanceTemplate()->SetInternalFieldCount(1);
  constructor_template->SetClassName(String::NewSymbol("MaxKey"));
  
  // Instance methods
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "toString", ToString);
  NODE_SET_PROTOTYPE_METHOD(constructor_template, "inspect", Inspect);  

  target->Set(String::NewSymbol("MaxKey"), constructor_template->GetFunction());
}

Handle<Value> MaxKey::Inspect(const Arguments &args) {
  return MaxKey::ToString(args);
}

Handle<Value> MaxKey::ToString(const Arguments &args) {
  HandleScope scope;
  // Return the raw data  
  return Object::New()->ToString();
}









