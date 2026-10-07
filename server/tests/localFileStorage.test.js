import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalFileStorage } from '../src/modules/uploads/localFileStorage.js';

let directory;

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe('private local file storage', () => {
  it('creates restrictive storage and file permissions and supports lifecycle operations', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'chatbot-uploads-'));
    const storage = createLocalFileStorage({ directory });
    const key = 'b0c80101-0000-4000-8000-000000000001';
    const contents = Buffer.from('private contents');

    await storage.write(key, contents);

    expect(await readFile(path.join(directory, key))).toEqual(contents);
    const rootPermissions = (await stat(directory)).mode & 0o777;
    const filePermissions = (await stat(path.join(directory, key))).mode & 0o777;
    if (process.platform !== 'win32') {
      expect(rootPermissions & 0o077).toBe(0);
      expect(filePermissions & 0o077).toBe(0);
    }

    await storage.delete(key);
    await expect(storage.read(key)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects non-UUID keys rather than resolving arbitrary filesystem paths', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'chatbot-uploads-'));
    const storage = createLocalFileStorage({ directory });

    await expect(storage.read('..\\outside.txt')).rejects.toThrow(/Invalid private file storage key/);
  });
});
