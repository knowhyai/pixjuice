// A minimal ZIP writer (store method, no compression) — enough for "sheet + JSON in one click".
// ASCII filenames only, which is all PixJuice produces.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Build a stored (uncompressed) ZIP archive. */
export function makeZip(entries: ZipEntry[]): Blob {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
  const u32 = (v: number) =>
    new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
  const header = (sig: number, ...parts: Uint8Array[]) => {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(4 + total);
    out.set(u32(sig), 0);
    let at = 4;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };

  for (const e of entries) {
    const name = new TextEncoder().encode(e.name);
    if (name.length > 0xffff) throw new Error(`zip: name too long: ${e.name}`);
    const crc = crc32(e.data);
    const local = header(
      0x04034b50,
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method: store
      u16(0), // time
      u16(0x2100), // date (1980-01-01, fixed for reproducibility)
      u32(crc),
      u32(e.data.length),
      u32(e.data.length),
      u16(name.length),
      u16(0),
      name,
    );
    chunks.push(local, e.data);
    central.push(
      header(
        0x02014b50,
        u16(20), // version made by
        u16(20), // version needed
        u16(0), // flags
        u16(0), // method
        u16(0), // time
        u16(0x2100), // date
        u32(crc),
        u32(e.data.length),
        u32(e.data.length),
        u16(name.length),
        u16(0), // extra len
        u16(0), // comment len
        u16(0), // disk number
        u16(0), // internal attrs
        u32(0), // external attrs
        u32(offset),
        name,
      ),
    );
    offset += local.length + e.data.length;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = header(
    0x06054b50,
    u16(0), // disk
    u16(0), // cd disk
    u16(entries.length),
    u16(entries.length),
    u32(cdSize),
    u32(offset),
    u16(0),
  );
  return new Blob([...chunks, ...central, eocd] as BlobPart[], { type: "application/zip" });
}
