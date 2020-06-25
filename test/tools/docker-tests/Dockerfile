# Example usage
#
# $ cd test/tools/docker-tests
# $ docker build --tag test-node-mongodb-native .
# $ docker run -it --net=host -v /tmp:/tmp test-node-mongodb-native 3.5 argon

FROM centos:7 AS base
RUN yum update -y && yum install -y git make gcc gcc-c++

FROM base

WORKDIR /root
COPY entrypoint.sh entrypoint.sh

ENV MONGODB_UNIFIED_TOPOLOGY 1
ENV MONGODB_HOST "host.docker.internal"
ENV GITHUB_REPO_URL "https://github.com/mongodb/node-mongodb-native.git"
ENV GITHUB_REPO_NAME "node-mongodb-native"

ENTRYPOINT ["/bin/bash", "/root/entrypoint.sh"]
CMD ["master", "dubnium"]
