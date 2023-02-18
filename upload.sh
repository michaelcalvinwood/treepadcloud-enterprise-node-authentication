#!/bin/bash

rsync -a --exclude "node_modules" . root@authentication.treepadcloud.com:/home/treepadcloud/authentication.treepadcloud.com
