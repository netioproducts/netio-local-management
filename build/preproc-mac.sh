#!/bin/bash
#
# macOS build script pre-processor.
#
# This is called from build-mac.sh before the app-bundle has been built.

EXT_DIR=./dist/${APP_BINARY}/extensions

rm -rf ${EXT_DIR}/backend
