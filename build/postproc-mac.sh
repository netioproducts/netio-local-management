#!/bin/bash
#
# macOS build script post-processor.
#
# This is called from build-mac.sh after each app-bundle has been built.

EXT_DIR="${APP_RESOURCES}/extensions"

if [ $APP_ARCH == "x64" ]; then
    find "${EXT_DIR}" -type f ! -name "be-darwin-x64" -delete
fi

if [ $APP_ARCH == "arm64" ]; then
    find "${EXT_DIR}" -type f ! -name "be-darwin-arm64" -delete
fi

if [ $APP_ARCH == "universal" ]; then
    find "${EXT_DIR}" -type f ! -name "be-darwin-x64" ! -name "be-darwin-arm64" -delete
fi
