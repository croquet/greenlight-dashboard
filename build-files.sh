#!/bin/sh

rm -rf dist
mkdir dist

[ -d node_modules ] || npm ci
npm run deploy
rsync -r --exclude="*hot-update*" --exclude=assets/icons ./build ./assets dist/
rsync -r --exclude="firebase-mock.js" --exclude="user.jsx" --exclude="*.jsx" ./src dist/
rsync -r ./thirdparty dist/

cp login.html user.html user2.html icon.png dist/
cp user2.html dist/index.html
cp firebaseConfig.js dist/

