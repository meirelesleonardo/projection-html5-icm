'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { normalizeOfficePackage, crc32 } = require('./zip-normalize');

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}

/** ZIP with data-descriptor flag, the shape LibreOffice refuses to open. */
function writeDataDescriptorZip(file, name, text) {
  const raw = Buffer.from(text, 'utf8');
  const data = zlib.deflateRawSync(raw);
  const crc = crc32(raw);
  const nameBuf = Buffer.from(name);
  const local = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0x0808),
    u16(8),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    u32(0),
    u16(nameBuf.length),
    u16(0),
    nameBuf,
    data,
    u32(0x08074b50),
    u32(crc),
    u32(data.length),
    u32(raw.length),
  ]);
  const central = Buffer.concat([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(0x0808),
    u16(8),
    u16(0),
    u16(0),
    u32(crc),
    u32(data.length),
    u32(raw.length),
    u16(nameBuf.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    nameBuf,
  ]);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(1),
    u16(1),
    u32(central.length),
    u32(local.length),
    u16(0),
  ]);
  fs.writeFileSync(file, Buffer.concat([local, central, eocd]));
}

describe('normalizeOfficePackage', () => {
  it('rewrites data-descriptor zips so local headers carry sizes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-norm-'));
    const src = path.join(dir, 'in.pptx');
    const dest = path.join(dir, 'out.pptx');
    writeDataDescriptorZip(src, 'ppt/slides/slide1.xml', '<p:sld>ola</p:sld>');
    assert.equal(fs.readFileSync(src).readUInt16LE(6), 0x0808);

    normalizeOfficePackage(src, dest);

    const out = fs.readFileSync(dest);
    const flags = out.readUInt16LE(6);
    assert.equal(flags & 0x0008, 0);
    const nameLen = out.readUInt16LE(26);
    const method = out.readUInt16LE(8);
    const compSize = out.readUInt32LE(18);
    const rawSize = out.readUInt32LE(22);
    assert.ok(compSize > 0);
    assert.equal(rawSize, Buffer.byteLength('<p:sld>ola</p:sld>'));
    const payload = out.subarray(30 + nameLen, 30 + nameLen + compSize);
    const text = (method === 8 ? zlib.inflateRawSync(payload) : payload).toString('utf8');
    assert.equal(text, '<p:sld>ola</p:sld>');
  });

  it('rejects password-protected packages', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-norm-'));
    const src = path.join(dir, 'in.pptx');
    const dest = path.join(dir, 'out.pptx');
    writeDataDescriptorZip(src, 'ppt/presentation.xml', '<p/>');
    const buf = fs.readFileSync(src);
    buf.writeUInt16LE(0x0001, 6);
    const centralFlagsAt = buf.length - 22 - (46 + Buffer.byteLength('ppt/presentation.xml')) + 8;
    buf.writeUInt16LE(0x0001, centralFlagsAt);
    fs.writeFileSync(src, buf);
    assert.throws(
      () => normalizeOfficePackage(src, dest),
      (err) => err.code === 'ENCRYPTED_PACKAGE'
    );
  });
});
