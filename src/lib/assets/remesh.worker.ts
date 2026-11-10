import { remesh } from './remesh.js';
self.onmessage = async (event) => {
  const { id, bytes, ratio } = event.data;
  try {
    const result = await remesh(new Uint8Array(bytes), ratio);
    self.postMessage({ id, ...result }, { transfer: [result.bytes.buffer] });
  } catch (error) { self.postMessage({ id, error: String(error) }); }
};
