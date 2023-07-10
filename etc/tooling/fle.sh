#! /bin/bash

USAGE="usage: fle.sh <command>

commands:
	link [--build-libmongocrypt]: (optionally builds libmongocrypt), builds the node bindings and links the bindings to the driver
	rebuild: rebuilds the node bindings
	unlink: unlinks the node bindings from the driver

required environment variables:
	NODE_BINDINGS - a path, relative or absolute, to the directory that contains the Node libmongocrypt bindings"

build_libmongocrypt() {
	cd $NODE_BINDINGS
	# clean out any stale builds
	git clean -fdx
	bash etc/build-static.sh
	cd -
}

build_node_bindings() {
	cd $NODE_BINDINGS
	npm run rebuild
	cd -
}

link_bindings() {
	npm link $NODE_BINDINGS
}

unlink_bindings() {
	npm unlink $NODE_BINDINGS
}

if [[ "$NODE_BINDINGS" == "" ]]; then
	echo "NODE_BINDINGS path must be set."
	exit 1
fi

case $1 in
	"link")
		if [[ "$2" == "--build-libmongocrypt" ]]; then
			build_libmongocrypt
		fi

		build_node_bindings
		link_bindings
		;;
	"rebuild")
		build_node_bindings
		;;
	"unlink")
		unlink_bindings
		;;
	*)
		echo "$USAGE"
		;;
esac
