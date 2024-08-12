const fileSyncJson = require('../filesync.json');
const dist = fileSyncJson['scriptsFolder'];
const src = 'src';
const allowedFiletypes = fileSyncJson['allowedFiletypes'];
const wasm = fileSyncJson["wasm"];

module.exports = {
  dist,
  src,
  allowedFiletypes,
  wasm: {
    src: "wasm",
    temp: "tmp",
    out: "wasm"
  },
};
