GIT_BRANCH=`git rev-parse --abbrev-ref HEAD`
USER=`whoami`
URL="https://docs-mongodborg-staging.corp.mongodb.com"
PREFIX=node-mongodb-native

.PHONY: help stage fake-deploy build-temp lint

CSS_ERRORS=errors,empty-rules,duplicate-properties,selector-max-approaching
CSS_WARNINGS=regex-selectors,unqualified-attributes,text-indent

help:
	@echo 'Targets'
	@echo '  help         - Show this help message'
	@echo '  stage        - Host online for review'
	@echo '  fake-deploy  - Create a fake deployment in the staging bucket'
	@echo '  lint         - Check the CSS'
	@echo ''
	@echo 'Variables'
	@echo '  ARGS         - Arguments to pass to mut-publish'

stage: build-temp
	mut-publish build/ docs-mongodb-org-staging --prefix=${PREFIX} --stage ${ARGS}
	@echo "Hosted at ${URL}/${PREFIX}/${USER}/${GIT_BRANCH}/index.html"
