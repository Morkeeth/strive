import {resolve,join} from 'node:path';
// The default remains Vercel's dist. Local rehearsals can write every generated asset to an external volume.
const output=resolve(process.env.STRIVE_BUILD_OUTPUT||'dist');
export function buildOutput(relative=''){return join(output,relative);}
