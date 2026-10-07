import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import config from '../../config/env.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createLocalFileStorage({ directory = config.uploads.storageDirectory } = {}) {
  const root = path.resolve(directory);

  function resolveKey(key) {
    if (typeof key !== 'string' || !UUID_PATTERN.test(key)) {
      throw new Error('Invalid private file storage key.');
    }
    return path.join(root, key);
  }

  return {
    async write(key, contents) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      if (process.platform !== 'win32') await chmod(root, 0o700);
      await writeFile(resolveKey(key), contents, { flag: 'wx', mode: 0o600 });
    },

    async read(key) {
      return readFile(resolveKey(key));
    },

    async delete(key) {
      await rm(resolveKey(key), { force: true });
    },
  };
}

export default createLocalFileStorage;
