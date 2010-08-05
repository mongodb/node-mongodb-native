#ifndef CODE_H_
#define CODE_H_

#include <node.h>
#include <node_object_wrap.h>
#include <v8.h>

using namespace v8;
using namespace node;

class Code : public ObjectWrap {  
  public:    
    Code();
    ~Code();    

    // Functions available from V8
    static void Initialize(Handle<Object> target);    
    static Handle<Value> ToString(const Arguments &args);
    static Handle<Value> Inspect(const Arguments &args);

    // Constructor used for creating new Long objects from C++
    static Persistent<FunctionTemplate> constructor_template;
    
  private:
    static Handle<Value> New(const Arguments &args);
};

#endif  // CODE_H_