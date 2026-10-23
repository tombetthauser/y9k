import { readFile } from 'node:fs/promises';
const sourceURL = new URL('../public/helpers.js', import.meta.url);
const source = (await readFile(sourceURL, 'utf8'))
    .replace(/^import \* as THREE from [^\n]+;/m, 'const THREE = {};')
    .replaceAll('import.meta.url', JSON.stringify(sourceURL.href));
export const helpers = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
