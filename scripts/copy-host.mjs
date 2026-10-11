import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targetDir = join(root, 'dist', 'nodes', 'OneScript');
mkdirSync(targetDir, { recursive: true });
copyFileSync(join(root, 'nodes', 'OneScript', 'autumn-host.os'), join(targetDir, 'autumn-host.os'));
