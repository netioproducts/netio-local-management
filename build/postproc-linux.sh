#!/bin/bash
#
# Linux build script post-processor.
#
# This is called from build-linux.sh after the app-bundle has been built.

EXT_DIR="${APP_DST}/extensions"

if [ $APP_ARCH = "x64" ]; then
    find "${EXT_DIR}" -type f ! -name "be-linux-x64" -delete
fi

if [ $APP_ARCH = "arm64" ]; then
    find "${EXT_DIR}" -type f ! -name "be-linux-arm64" -delete
fi

if [ $APP_ARCH = "armhf" ]; then
    find "${EXT_DIR}" -type f ! -name "be-linux-armhf" -delete
fi

# Make sure the main app binary is executable
chmod +x "${APP_DST}/${APP_BINARY}-linux_${APP_ARCH}"
