export type RESP = string | number | null | RESP[];

export function parse(
  buf: Buffer,
  pos = 0,
): { value: RESP; next: number } | null {
  if (pos >= buf.length) return null;
  const type = String.fromCharCode(buf[pos]);
  const end = buf.indexOf("\r\n", pos);
  if (end === -1) return null;
  const line = buf.toString("utf-8", pos + 1, end);
  const afterline = end + 2; //to pass \r\n
  switch (type) {
    case "+":
      return { value: line, next: afterline };

    case ":":
      return { value: parseInt(line, 10), next: afterline };
    case "$": {
      const len = parseInt(line, 10);
      if (len === -1) return { value: null, next: afterline };
      if (buf.length < afterline + len + 2) return null;
      return {
        value: buf.toString("utf8", afterline, afterline + len),
        next: afterline + len + 2,
      };
    }
    case "*": {
      //*2\r\n$5\r\nhello\r\n$5\r\nworld\r\n
      const count = parseInt(line, 10); //2
      if (count === -1) return { value: null, next: afterline };
      const items: RESP[] = [];
      let p = afterline; //indexof $
      for (let i = 0; i < count; i++) {
        const r = parse(buf, p);
        if (!r) return null; // incomplete
        items.push(r.value);
        p = r.next;
      }
      return { value: items, next: p };
    }
    default:
      throw new Error(`Unknown RESP type: ${type}`);
  }
}
export const bulk = (s: string) => `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
export const nullBulkStr = () => `$-1\r\n`;
export const simple = (s: string) => `+${s}\r\n`;
export const err = (msg: string) => `-ERR ${msg}\r\n`;
