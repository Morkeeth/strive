// Ship the installed, pinned @vercel/og browser engine. Its build expects a worker
// WASM import; browsers compile the same local bytes. Draft text never goes to
// dynamic Google-font or emoji services. Unsupported glyphs use the local font.
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
export async function buildReviewImageEngine(target='dist/review-image-engine'){
 const source='node_modules/@vercel/og/dist/';await mkdir(target,{recursive:true});
 let code=await readFile(source+'index.edge.js','utf8');
 const wasm='import resvg_wasm from "./resvg.wasm?module";';
 const dynamic='loadAdditionalAsset: loadDynamicAsset({\n      emoji: options.emoji\n    })';
 if(!code.includes(wasm)||!code.includes(dynamic))throw new Error('Review image engine upstream adapter changed');
 code=code.replace(wasm,'var resvg_wasm = await WebAssembly.compile(await (await fetch(new URL("./resvg.wasm", import.meta.url))).arrayBuffer());')
  .replace(dynamic,'loadAdditionalAsset: async () => undefined')
  .replaceAll('process.env.NODE_ENV','"production"').replaceAll('process.env.JEST_WORKER_ID','undefined');
 await writeFile(target+'/index.js',code);
 await Promise.all(['resvg.wasm','noto-sans-v27-latin-regular.ttf'].map(file=>cp(source+file,target+'/'+file)));
}
