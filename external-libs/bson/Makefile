NODE = node
name = all
JOBS = 1

all:
	rm -rf build .lock-wscript bson.node
	node-waf configure build
	cp -R ./build/Release/bson.node . || true
	@$(NODE) --expose-gc test_bson.js
	@$(NODE) --expose-gc test_full_bson.js

all_debug:
	rm -rf build .lock-wscript bson.node
	node-waf --debug configure build
	cp -R ./build/Release/bson.node . || true
	@$(NODE) --expose-gc test_bson.js
	@$(NODE) --expose-gc test_full_bson.js

test:
	@$(NODE) --expose-gc test_bson.js
	@$(NODE) --expose-gc test_full_bson.js

clang:
	rm -rf build .lock-wscript bson.node
	CXX=clang node-waf configure build
	cp -R ./build/Release/bson.node . || true
	@$(NODE) --expose-gc test_bson.js
	@$(NODE) --expose-gc test_full_bson.js

clang_debug:
	rm -rf build .lock-wscript bson.node
	CXX=clang node-waf --debug configure build
	cp -R ./build/Release/bson.node . || true
	@$(NODE) --expose-gc test_bson.js
	@$(NODE) --expose-gc test_full_bson.js

clean:
	rm -rf build .lock-wscript bson.node

.PHONY: all