/**
 * Minimal ZIP writer (STORE only, no compression). Offline-friendly, no CDN.
 * Usage: ZipStore.build([{ name: 'a.txt', data: 'hello' | Uint8Array | Blob }]) → Promise<Blob>
 */
(function (global) {
  'use strict';

  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function u16(n) {
    const b = new Uint8Array(2);
    b[0] = n & 0xff; b[1] = (n >>> 8) & 0xff;
    return b;
  }
  function u32(n) {
    const b = new Uint8Array(4);
    b[0] = n & 0xff; b[1] = (n >>> 8) & 0xff;
    b[2] = (n >>> 16) & 0xff; b[3] = (n >>> 24) & 0xff;
    return b;
  }

  function encName(name) {
    // Prefer UTF-8; set general-purpose bit 11
    return new TextEncoder().encode(String(name).replace(/\\/g, '/'));
  }

  async function toU8(data) {
    if (data == null) return new Uint8Array(0);
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      const ab = await data.arrayBuffer();
      return new Uint8Array(ab);
    }
    if (typeof data === 'string') return new TextEncoder().encode(data);
    return new TextEncoder().encode(String(data));
  }

  function concat(parts) {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  /**
   * @param {{ name: string, data: any }[]} files
   * @returns {Promise<Blob>}
   */
  async function build(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    const list = files || [];

    for (const f of list) {
      const nameBytes = encName(f.name || 'file');
      const data = await toU8(f.data);
      const crc = crc32(data);
      const size = data.length;
      // local header
      const local = concat([
        u32(0x04034b50),
        u16(20),          // version needed
        u16(0x0800),      // UTF-8 flag
        u16(0),           // method STORE
        u16(0), u16(0),   // time/date
        u32(crc),
        u32(size),
        u32(size),
        u16(nameBytes.length),
        u16(0),           // extra
        nameBytes,
        data,
      ]);
      const central = concat([
        u32(0x02014b50),
        u16(20), u16(20),
        u16(0x0800),
        u16(0),
        u16(0), u16(0),
        u32(crc),
        u32(size),
        u32(size),
        u16(nameBytes.length),
        u16(0), u16(0),
        u16(0), u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    }

    const centralBlob = concat(centrals);
    const end = concat([
      u32(0x06054b50),
      u16(0), u16(0),
      u16(list.length),
      u16(list.length),
      u32(centralBlob.length),
      u32(offset),
      u16(0),
    ]);

    const zipBytes = concat(locals.concat([centralBlob, end]));
    return new Blob([zipBytes], { type: 'application/zip' });
  }

  global.ZipStore = { build, crc32 };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = globalThis.ZipStore;
}
