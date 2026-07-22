#!/bin/bash
set -e

rm -rf dist
mkdir dist

cd react-src && bun run build && cd ..

# rm -rf extensions/be-linux-x64 extensions/be-darwin-arm64 extensions/be-windows-x64 extensions/be-darwin-x64
cd extensions/backend && bun run build && cd ../..

# bun build ./extensions/backend/src/main.ts --compile --minify --target=bun-linux-x64 --outfile=extensions/be-linux-x64
# bun build ./extensions/backend/src/main.ts --compile --minify --target=bun-darwin-arm64 --outfile=extensions/be-darwin-arm64
# bun build ./extensions/backend/src/main.ts --compile --minify --target=bun-darwin-x64 --outfile=extensions/be-darwin-x64
# bun build ./extensions/backend/src/main.ts --compile --minify --target=bun-windows-x64 --outfile=extensions/be-windows-x64

cp build/preproc* .
cp build/postproc* .
cp -r build/_app_scaffolds .

./build/build-linux.sh
./build/build-mac.sh
./build/build-win.sh

rm preproc*
rm postproc*
rm -rf _app_scaffolds
