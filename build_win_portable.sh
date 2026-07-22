#!/bin/bash
set -e

APP_NAME="netio-local-management"
WIN_DIR="dist/win_x64/${APP_NAME}"
OUTPUT_EXE="dist/win_x64/${APP_NAME}-portable.exe"

# To download warp-packer
# wget -qO warp-packer "https://github.com/dgiagio/warp/releases/download/v0.3.0/linux-x64.warp-packer"
# chmod +x warp-packer

if [ ! -f "warp-packer" ]; then
    echo "Error: warp-packer not found. Please download it."
    exit 1
fi

if [ ! -d "$WIN_DIR" ]; then
    echo "Error: Directory $WIN_DIR does not exist. Run your build script first."
    exit 1
fi

echo "Packing Windows application into a single .exe"
rm -f "$OUTPUT_EXE"

./warp-packer --arch windows-x64 --input_dir "$WIN_DIR" --exec "${APP_NAME}.exe" --output "$OUTPUT_EXE"

# Patching PE Subsystem to hide console window
python3 -c '
import sys
filepath = sys.argv[1]
with open(filepath, "r+b") as f:
    f.seek(0x3C)
    pe_offset = int.from_bytes(f.read(4), "little")
    f.seek(pe_offset + 24 + 68)
    f.write((2).to_bytes(2, "little"))
' "$OUTPUT_EXE"

echo "Portable Windows app is ready at:"
echo "$OUTPUT_EXE"
