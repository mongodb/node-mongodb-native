NODE = node
NPM = npm
JSDOC = jsdoc
name = all

generate_docs:
	cp -R ./docs/history-header.md ./docs/content/meta/release-notes.md
	more ./HISTORY.md >> ./docs/content/meta/release-notes.md
	hugo -s docs/ -d ../public
	$(JSDOC) -c conf.json -t docs/jsdoc-template/ -d ./public/api
	cp -R ./public/api/scripts ./public/.
	cp -R ./public/api/styles ./public/.

.PHONY: total
