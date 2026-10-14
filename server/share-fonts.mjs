import {readFile} from 'node:fs/promises';
import LinkPreview from '../site/link-preview-card.js';
// The share images are set in the site's typeface (site/fonts, SIL Open Font License 1.1), read
// from disk once per instance. vercel.json ships site/fonts with each image function; without the
// files the renderer keeps its bundled font and the image still renders.
let loaded=null;
export const shareFonts=()=>loaded||=LinkPreview.fonts(file=>readFile(new URL('../site/fonts/'+file,import.meta.url)));
