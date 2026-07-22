#!/bin/bash
set -e

APP_NAME="netio-local-management"
LINUX_DIR="dist/linux_x64/${APP_NAME}"
OUTPUT_BIN="dist/linux_x64/${APP_NAME}-portable"

# To download warp-packer
# wget -qO warp-packer "https://github.com/dgiagio/warp/releases/download/v0.3.0/linux-x64.warp-packer"
# chmod +x warp-packer

if [ ! -f "warp-packer" ]; then
    echo "Error: warp-packer not found. Please download it."
    exit 1
fi
    
if [ ! -d "$LINUX_DIR" ]; then
    echo "Error: Directory $LINUX_DIR does not exist. Run your build script first."
    exit 1
fi

echo "Packing Linux application into a single binary"
rm -f "$OUTPUT_BIN"

./warp-packer --arch linux-x64 --input_dir "$LINUX_DIR" --exec "${APP_NAME}-linux_x64" --output "$OUTPUT_BIN"

echo "Portable Linux app is ready at:"
echo "$OUTPUT_BIN"
