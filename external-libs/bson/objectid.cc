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
}

ObjectID::~ObjectID() {}

Handle<Value> ObjectID::New(const Arguments &args) {
  HandleScope scope;

  return String::New("ObjectID::New");
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

  return String::New("ObjectID::ToString");
}