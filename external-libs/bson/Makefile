NODE = node
name = all
JOBS = 1

all:
	rm -rf build .lock-wscript bson.node
	node-waf configure build
	cp -R ./build/Release/bson.node . || true
	# @$(NODE) --expose-gc test/test_bson.js
	# @$(NODE) --expose-gc test/test_full_bson.js
	# @$(NODE) --expose-gc test/test_stackless_bson.js
	# @$(NODE) --expose-gc test/test_shared_objects.js

all_debug:
	rm -rf build .lock-wscript bson.node
	node-waf --debug configure build
	cp -R ./build/Release/bson.node . || true
	# @$(NODE) --expose-gc test/test_bson.js
	# @$(NODE) --expose-gc test/test_full_bson.js
	# @$(NODE) --expose-gc test/test_stackless_bson.js
	# @$(NODE) --expose-gc test/test_shared_objects.js

test:
	# @$(NODE) --expose-gc test/test_bson.js
	# @$(NODE) --expose-gc test/test_full_bson.js
	# @$(NODE) --expose-gc test/test_stackless_bson.js
	# @$(NODE) --expose-gc test/test_shared_objects.js

clang:
	rm -rf build .lock-wscript bson.node
	CXX=clang node-waf configure build
	cp -R ./build/Release/bson.node . || true
	# @$(NODE) --expose-gc test/test_bson.js
	# @$(NODE) --expose-gc test/test_full_bson.js
	# @$(NODE) --expose-gc test/test_stackless_bson.js
	# @$(NODE) --expose-gc test/test_shared_objects.js

clang_debug:
	rm -rf build .lock-wscript bson.node
	CXX=clang node-waf --debug configure build
	cp -R ./build/Release/bson.node . || true
	# @$(NODE) --expose-gc test/test_bson.js
	# @$(NODE) --expose-gc test/test_full_bson.js
	# @$(NODE) --expose-gc test/test_stackless_bson.js
	# @$(NODE) --expose-gc test/test_shared_objects.js

clean:
	rm -rf build .lock-wscript bson.node

.PHONY: all