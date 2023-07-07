#! /bin/bash

USAGE="usage: fle.sh <command>

commands:
	link [--build-libmongocrypt]: builds the node bindings, optionally building libmongocrypt and links it to the driver
	rebuild: rebuilds the node bindings
	unlink: unlinks the node bindings from the driver

required environment variables:
	node_bindings - a path, relative or absolute, to the directory that contains the Node libmongocrypt bindings"

build_libmongocrypt() {
	cd $node_bindings
	# clean out any stale builds
	git clean -fdx
	bash etc/build-static.sh
	cd -
}

build_node_bindings() {
	cd $node_bindings
	npm run rebuild
	cd -
}

link_bindings() {
	npm link $node_bindings
}

unlink_bindings() {
	npm unlink $node_bindings
}

if [[ "$node_bindings" == "" ]]; then
	echo "node_bindings path must be set."
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
