// keep as named fn
export function serialize(obj: unknown): Buffer {
  return Buffer.from(JSON.stringify(obj));
}
// keep as named fn
export function deserialize(buf: Buffer): unknown {
  return JSON.parse(buf.toString('utf8'));
}
