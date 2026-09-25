import { get, head, put, BlobPreconditionFailedError } from '@vercel/blob';

export interface DocumentTransport {
  read(path: string): Promise<{ text: string; etag: string } | null>;
  write(path: string, text: string, etag: string | null): Promise<boolean>;
}

export function canonicalEtag(value: string) {
  return value
    .trim()
    .replace(/^W\//, '')
    .replace(/^"(.*)"$/, '$1');
}

const transport: DocumentTransport = {
  async read(path) {
    const result = await get(path, {
      access: 'private',
      useCache: false,
      headers: { 'Accept-Encoding': 'identity' },
      abortSignal: AbortSignal.timeout(10000),
    });
    if (!result) return null;
    if (result.statusCode !== 200) throw new Error('Unexpected storage response.');
    if (!result.blob.etag) throw new Error('Storage response is missing its concurrency token.');
    return { text: await new Response(result.stream).text(), etag: result.blob.etag };
  },
  async write(path, text, etag) {
    try {
      let writeEtag = etag;
      if (etag !== null) {
        // Delivery HTTP ETags may be weak/quoted by compression middleware.
        // Obtain the storage API's exact write token, but only for the same version
        // we read. Never substitute a newer token onto an older document body.
        const current = await head(path, { abortSignal: AbortSignal.timeout(10000) });
        if (!current.etag) throw new Error('Storage metadata is missing its concurrency token.');
        if (canonicalEtag(current.etag) !== canonicalEtag(etag)) return false;
        writeEtag = current.etag;
      }
      await put(path, text, {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        abortSignal: AbortSignal.timeout(10000),
        allowOverwrite: etag !== null,
        ...(writeEtag ? { ifMatch: writeEtag } : {}),
      });
      return true;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) return false;
      // Concurrent first writers: never overwrite a document created by another function.
      // The SDK has no dedicated AlreadyExists error. Confirm existence before retrying.
      if (etag === null && (await transport.read(path))) return false;
      throw error;
    }
  },
};

export function createDocumentStore(io: DocumentTransport = transport) {
  return {
    async read<T>(path: string, initial: () => T): Promise<T> {
      const doc = await io.read(path);
      return doc ? JSON.parse(doc.text) : initial();
    },
    async transact<T, R>(path: string, initial: () => T, fn: (value: T) => R) {
      for (let attempt = 0; attempt < 24; attempt++) {
        const doc = await io.read(path);
        const value: T = doc ? JSON.parse(doc.text) : initial();
        const before = JSON.stringify(value);
        const result = fn(value);
        const text = JSON.stringify(value);
        if (text === before || (await io.write(path, text, doc?.etag ?? null))) {
          return { value, result };
        }
        await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 60));
      }
      throw new Error('The queue is busy. Please try again.');
    },
  };
}

export const documents = createDocumentStore();
// Each environment gets a separate installation even when the same store is connected.
export function documentPath(name: string) {
  const namespace = process.env.BLOB_NAMESPACE || process.env.VERCEL_ENV || 'development';
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(namespace)) throw new Error('Invalid BLOB_NAMESPACE.');
  return `cyberwriter/${namespace}/${name}.json`;
}
