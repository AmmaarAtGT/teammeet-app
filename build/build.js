// Bundles @livekit/track-processors (background blur / virtual background) for the browser.
// livekit-client is NOT re-bundled: it is mapped to the global window.LivekitClient.
const path = require('path');
const fs = require('fs');
fs.mkdirSync(path.join(__dirname, '..', 'public', 'vendor'), { recursive: true });
fs.copyFileSync(
  path.join(__dirname, '..', 'node_modules', 'livekit-client', 'dist', 'livekit-client.umd.js'),
  path.join(__dirname, '..', 'public', 'vendor', 'livekit-client.umd.js')
);
// Self-host the MediaPipe runtime + selfie-segmentation model used for background blur,
// so the browser never has to reach jsDelivr / Google Storage (privacy + works on locked-down networks).
const mpOut = path.join(__dirname, '..', 'public', 'vendor', 'mediapipe');
fs.mkdirSync(path.join(mpOut, 'wasm'), { recursive: true });
const wasmSrc = path.join(__dirname, '..', 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
for (const f of fs.readdirSync(wasmSrc)) fs.copyFileSync(path.join(wasmSrc, f), path.join(mpOut, 'wasm', f));
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const modelFile = path.join(mpOut, 'selfie_segmenter.tflite');
const modelReady = fs.existsSync(modelFile)
  ? Promise.resolve()
  : fetch(MODEL_URL)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((b) => fs.writeFileSync(modelFile, Buffer.from(b)))
      .then(() => console.log('Downloaded background-segmentation model'))
      .catch((e) => console.warn(`! Could not download ${MODEL_URL} (${e.message}). Browsers will fetch it from Google's CDN instead.`));

require('esbuild').buildSync({
  entryPoints: [path.join(__dirname, 'processors-entry.js')],
  bundle: true,
  format: 'iife',
  globalName: 'TrackProcessors',
  minify: true,
  target: 'es2020',
  alias: { 'livekit-client': path.join(__dirname, 'lk-shim.js') },
  outfile: path.join(__dirname, '..', 'public', 'vendor', 'track-processors.js'),
});
modelReady.then(() => console.log('Built public/vendor/ (livekit-client, track-processors, mediapipe)'));
