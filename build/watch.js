const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const packageJson = require('../package.json');
const syncDirectory = require('sync-directory');
const fg = require('fast-glob');
const chokidar = require('chokidar');
const { src, dist, allowedFiletypes, wasm } = require('./config');

/** Format dist path for printing */
function normalize(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Sync static files.
 * Include init and watch phase.
 */
async function syncStatic() {
  syncDirectory.async(path.resolve(src), path.resolve(dist), {
    exclude: (file) => {
      const { ext } = path.parse(file);
      return ext && !allowedFiletypes.includes(ext);
    },
    async afterEachSync(event) {
      // log file action
      let eventType;
      if (event.eventType === 'add' || event.eventType === 'init:copy') {
        eventType = 'changed';
      } else if (event.eventType === 'unlink') {
        eventType = 'deleted';
      }
      if (eventType) {
        let relative = event.relativePath;
        if (relative[0] === '\\') {
          relative = relative.substring(1);
        }
        console.log(`${normalize(relative)} ${eventType}`);
      }
    },
    watch: true,
    deleteOrphaned: true,
  });
}

/**
 * Sync ts script files.
 * Init phase only.
 */
async function initTypeScript() {
  const distFiles = await fg(`${dist}/**/*.js`);
  for (const distFile of distFiles) {
    // search existing *.js file in dist
    const relative = path.relative(dist, distFile);
    const srcFile = path.resolve(src, relative);
    // if srcFile does not exist, delete distFile
    if (
      !fs.existsSync(srcFile) &&
      !fs.existsSync(srcFile.replace(/\.js$/, '.ts'))
    ) {
      try {
        await fs.promises.unlink(distFile);
        console.log(`${normalize(relative)} deleted`);
      } catch {}
    }
  }
}

/**
 * Sync ts script files.
 * Watch phase only.
 */
async function watchTypeScript() {
  chokidar.watch(`${src}/**/*.ts`).on('unlink', async (p) => {
    // called on *.ts file get deleted
    const relative = path.relative(src, p).replace(/\.ts$/, '.js');
    const distFile = path.resolve(dist, relative);
    // if distFile exists, delete it
    if (fs.existsSync(distFile)) {
      await fs.promises.unlink(distFile);
      console.log(`${normalize(relative)} deleted`);
    }
  });
}

/**
 * Sync ts script files.
 * Include init and watch phase.
 */
async function syncTypeScript() {
  await initTypeScript();
  return watchTypeScript();
}

const moduleName = packageJson.name.replace("-","_");

const jsFileText = `
import * as ${moduleName}_bg from './${moduleName}_bg.js';
const { __wbg_set_wasm } = ${moduleName}_bg;

/*
 * Initialize the WASM module.
 */
export async function init(ns) {
  const wasmb64 = ns.read("${wasm.out}/${moduleName}.wasm.txt");
  const bytes = Uint8Array.from(atob(wasmb64), c => c.charCodeAt(0));
  const wasm = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(wasm, {
    "./${moduleName}_bg.js": ${moduleName}_bg
  });

  __wbg_set_wasm(instance.exports);
}

export * from "./${moduleName}_bg.js";
`

async function compileWasm() {
  console.log(`Compiling WASM.`);
  childProcess.execSync(`wasm-pack build ./ --out-dir ${wasm.temp}`);

  const wasmText = await fs.promises.readFile(`./${wasm.temp}/${moduleName}_bg.wasm`);
  await fs.promises.writeFile(`${path.join(dist, wasm.out, `${moduleName}.wasm.txt`)}`, Buffer.from(wasmText).toString('base64'));
  await fs.promises.cp(
    `${path.join(wasm.temp, `${moduleName}_bg.js`)}`,
    `${path.join(dist, wasm.out, `${moduleName}_bg.js`)}`
  );
}

async function watchWasm() {
  chokidar.watch(`${wasm.src}/**/*.rs`).on('change', async () => {
    await compileWasm();
  });
}

async function initWasm() {
  await fs.promises.rm(`${wasm.temp}`, { recursive: true, force: true });
  await fs.promises.mkdir(`${wasm.temp}`, { recursive: true });
  await fs.promises.mkdir(`${path.join(dist, wasm.out)}`, { recursive: true });
  await fs.promises.writeFile(`${path.join(dist, wasm.out, `${moduleName}.js`)}`, jsFileText);
  await compileWasm();
}

async function syncWasm() {
  await initWasm();
  return watchWasm();
}

console.log('Start watching static, ts and rs files...');

async function main() {
  await syncStatic();
  await syncTypeScript();
  await syncWasm();
}

main();