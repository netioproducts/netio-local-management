#!/bin/bash
#
# Windows build script post-processor.
#
# This is called from build-win.sh after the app-bundle has been built.

EXT_DIR="${APP_DST}/extensions"

if [ $APP_ARCH == "x64" ]; then
    find "${EXT_DIR}" -type f ! -name "be-windows-x64.exe" -delete
fi
