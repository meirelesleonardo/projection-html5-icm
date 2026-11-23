'use strict';

const fs = require('fs');
const zlib = require('zlib');

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_EOCD = 0x06064b50;
const SIG_ZIP64_LOC = 0x07064b50;
const ZIP64_EXTRA = 0x0001;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8 = 0x0800;

/**
 * PowerPoint often writes PPTX with ZIP data descriptors (flag bit 3, sizes
 * zero in the local header). LibreOffice then reports
 * "source file could not be loaded". Rewriting the package with sizes in the
 * local headers makes the same bytes load.
 */
function normalizeOfficePackage(srcPath, destPath) {
  const buf = fs.readFileSync(srcPath);
  const entries = readZipEntries(buf);
  const parts = [];
  const central = [];
  let offset = 0;

  entries.forEach((entry) => {
    if (entry.flags & FLAG_ENCRYPTED) {
      const err = new Error('Arquivo protegido por senha. Remova a senha ou exporte como PDF.');
      err.code = 'ENCRYPTED_PACKAGE';
      throw err;
    }
    const raw = inflateEntry(buf, entry);
    const stored = deflateEntry(raw);
    const name = Buffer.from(entry.name, 'utf8');
    const flags = /[^\x00-\x7f]/.test(entry.name) ? FLAG_UTF8 : 0;
    const local = Buffer.concat([
      headerLocal(name, stored, flags),
      name,
      stored.data,
    ]);
    parts.push(local);
    central.push(headerCentral(name, stored, flags, offset));
    central.push(name);
    offset += local.length;
  });

  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  fs.writeFileSync(destPath, Buffer.concat(parts.concat([cd, eocd])));
}

function headerLocal(name, stored, flags) {
  const h = Buffer.alloc(30);
  h.writeUInt32LE(SIG_LOCAL, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(flags, 6);
  h.writeUInt16LE(stored.method, 8);
  h.writeUInt32LE(stored.crc, 14);
  h.writeUInt32LE(stored.data.length, 18);
  h.writeUInt32LE(stored.rawLength, 22);
  h.writeUInt16LE(name.length, 26);
  return h;
}

function headerCentral(name, stored, flags, offset) {
  const h = Buffer.alloc(46);
  h.writeUInt32LE(SIG_CENTRAL, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(20, 6);
  h.writeUInt16LE(flags, 8);
  h.writeUInt16LE(stored.method, 10);
  h.writeUInt32LE(stored.crc, 16);
  h.writeUInt32LE(stored.data.length, 20);
  h.writeUInt32LE(stored.rawLength, 24);
  h.writeUInt16LE(name.length, 28);
  h.writeUInt32LE(offset, 42);
  return h;
}

function deflateEntry(raw) {
  if (!raw.length) {
    return { method: 0, data: Buffer.alloc(0), crc: 0, rawLength: 0 };
  }
  return {
    method: 8,
    data: zlib.deflateRawSync(raw),
    crc: crc32(raw),
    rawLength: raw.length,
  };
}

function inflateEntry(buf, entry) {
  const payload = slicePayload(buf, entry);
  if (entry.method === 0) return payload;
  if (entry.method === 8) return zlib.inflateRawSync(payload);
  const err = new Error('Pacote Office com compressão não suportada');
  err.code = 'BAD_PACKAGE';
  throw err;
}

function slicePayload(buf, entry) {
  const off = entry.localOffset;
  if (off + 30 > buf.length || buf.readUInt32LE(off) !== SIG_LOCAL) {
    const err = new Error('Pacote Office inválido');
    err.code = 'BAD_PACKAGE';
    throw err;
  }
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const start = off + 30 + nameLen + extraLen;
  const end = start + entry.compressedSize;
  if (end > buf.length) {
    const err = new Error('Pacote Office truncado');
    err.code = 'BAD_PACKAGE';
    throw err;
  }
  return buf.subarray(start, end);
}

function readZipEntries(buf) {
  const eocd = findEocd(buf);
  let cdOffset = eocd.cdOffset;
  let count = eocd.entries;
  if (cdOffset === 0xffffffff || count === 0xffff) {
    const zip64 = findZip64(buf, eocd.offset);
    cdOffset = zip64.cdOffset;
    count = zip64.entries;
  }
  const entries = [];
  let pos = cdOffset;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== SIG_CENTRAL) {
      const err = new Error('Pacote Office inválido');
      err.code = 'BAD_PACKAGE';
      throw err;
    }
    const flags = buf.readUInt16LE(pos + 8);
    const method = buf.readUInt16LE(pos + 10);
    let crc = buf.readUInt32LE(pos + 16);
    let compressedSize = buf.readUInt32LE(pos + 20);
    let uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    let localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    const extra = buf.subarray(pos + 46 + nameLen, pos + 46 + nameLen + extraLen);
    const zip64 = readZip64Extra(extra, {
      uncompressedSize,
      compressedSize,
      localOffset,
    });
    uncompressedSize = zip64.uncompressedSize;
    compressedSize = zip64.compressedSize;
    localOffset = zip64.localOffset;
    if (crc === 0xffffffff) crc = zip64.crc || crc;
    entries.push({
      name,
      flags,
      method,
      crc,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZip64Extra(extra, sizes) {
  const out = {
    uncompressedSize: sizes.uncompressedSize,
    compressedSize: sizes.compressedSize,
    localOffset: sizes.localOffset,
  };
  let p = 0;
  while (p + 4 <= extra.length) {
    const id = extra.readUInt16LE(p);
    const size = extra.readUInt16LE(p + 2);
    const body = extra.subarray(p + 4, p + 4 + size);
    p += 4 + size;
    if (id !== ZIP64_EXTRA) continue;
    let o = 0;
    if (out.uncompressedSize === 0xffffffff && o + 8 <= body.length) {
      out.uncompressedSize = Number(body.readBigUInt64LE(o));
      o += 8;
    }
    if (out.compressedSize === 0xffffffff && o + 8 <= body.length) {
      out.compressedSize = Number(body.readBigUInt64LE(o));
      o += 8;
    }
    if (out.localOffset === 0xffffffff && o + 8 <= body.length) {
      out.localOffset = Number(body.readBigUInt64LE(o));
    }
  }
  return out;
}

function findEocd(buf) {
  const min = Math.max(0, buf.length - (65535 + 22));
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) !== SIG_EOCD) continue;
    const commentLen = buf.readUInt16LE(i + 20);
    if (i + 22 + commentLen !== buf.length) continue;
    return {
      offset: i,
      entries: buf.readUInt16LE(i + 10),
      cdOffset: buf.readUInt32LE(i + 16),
    };
  }
  const err = new Error('Pacote Office inválido');
  err.code = 'BAD_PACKAGE';
  throw err;
}

function findZip64(buf, eocdOffset) {
  const loc = eocdOffset - 20;
  if (loc < 0 || buf.readUInt32LE(loc) !== SIG_ZIP64_LOC) {
    const err = new Error('Pacote Office inválido');
    err.code = 'BAD_PACKAGE';
    throw err;
  }
  const zip64Off = Number(buf.readBigUInt64LE(loc + 8));
  if (buf.readUInt32LE(zip64Off) !== SIG_ZIP64_EOCD) {
    const err = new Error('Pacote Office inválido');
    err.code = 'BAD_PACKAGE';
    throw err;
  }
  return {
    entries: Number(buf.readBigUInt64LE(zip64Off + 32)),
    cdOffset: Number(buf.readBigUInt64LE(zip64Off + 48)),
  };
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

module.exports = {
  normalizeOfficePackage,
  crc32,
};
