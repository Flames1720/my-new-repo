import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const url = 'https://raw.githubusercontent.com/programasweights/avatar/main/public/assets/character.glb';
const output = 'public/assets/player-character.glb';

const response = await fetch(url);
if (!response.ok) throw new Error('Character download failed: HTTP ' + response.status);

const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.length < 100_000) throw new Error('Character asset is unexpectedly small');

await mkdir(dirname(output), { recursive: true });
await writeFile(output, bytes);
console.log('Character asset ready: ' + output + ' (' + bytes.length + ' bytes)');
