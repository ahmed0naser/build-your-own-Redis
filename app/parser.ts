/**
 * Minimal RESP2/RESP3 parser.
 *
 * `parse` converts RESP into native JavaScript values:
 *
 *   +OK\r\n                  -> "OK"
 *   -ERR bad\r\n             -> Error("ERR bad")
 *   :42\r\n                  -> 42
 *   $5\r\nhello\r\n          -> "hello"
 *   $-1\r\n                  -> null
 *   *2\r\n:1\r\n+hi\r\n      -> [1, "hi"]
 *   _\r\n                    -> null
 *   #t\r\n                   -> true
 *   ,1.5\r\n                 -> 1.5
 *   (12345678901234567890\r\n -> 12345678901234567890n
 *   !5\r\nERR x\r\n          -> Error("ERR x")
 *   =9\r\ntxt:hello\r\n      -> "hello"
 *   %1\r\n+key\r\n:1\r\n     -> Map { "key" => 1 }
 *   ~2\r\n+a\r\n+b\r\n       -> Set { "a", "b" }
 *   >1\r\n+msg\r\n           -> ["msg"]
 *
 * Returns `undefined` when the input does not contain a complete value yet.
 * Throws a regular `Error` when the bytes are invalid RESP.
 *
 * Attributes (`|`) are metadata for the reply that follows them, so they are
 * consumed and the following value is returned.
 */

const CR = 0x0d;
const LF = 0x0a;
const COLON = 0x3a;

export type RespValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | Error
  | RespValue[]
  | Map<RespValue, RespValue>
  | Set<RespValue>;

class IncompleteInput extends Error {}

export function parse(input: Uint8Array): RespValue | undefined {
  const reader = new Reader(input);
  try {
    return reader.readValue();
  } catch (error) {
    if (error instanceof IncompleteInput) return undefined;
    throw error;
  }
}

class Reader {
  private offset = 0;
  private readonly decoder = new TextDecoder();

  constructor(private readonly input: Uint8Array) {}

  readValue(): RespValue {
    const marker = String.fromCharCode(this.readByte());

    switch (marker) {
      case "+":
        return this.readLine();

      case "-":
        return new Error(this.readLine());

      case ":":
        return this.readInteger();

      case "$": {
        const length = this.readInteger();
        return length === -1 ? null : this.decoder.decode(this.readPayload(length));
      }

      case "*": {
        const count = this.readInteger();
        return count === -1 ? null : this.readValues(count);
      }

      case "_":
        this.readLine();
        return null;

      case "#": {
        const flag = this.readLine();
        if (flag === "t") return true;
        if (flag === "f") return false;
        throw new Error(`Invalid boolean "${flag}"`);
      }

      case ",":
        return this.readDouble();

      case "(":
        return this.readBigNumber();

      case "!": {
        const length = this.readInteger();
        return new Error(this.decoder.decode(this.readPayload(length)));
      }

      case "=": {
        const length = this.readInteger();
        const bytes = this.readPayload(length);
        if (bytes.length < 4 || bytes[3] !== COLON) {
          throw new Error("Invalid verbatim string");
        }
        return this.decoder.decode(bytes.subarray(4));
      }

      case "%":
        return new Map(this.readPairs(this.readInteger()));

      case "~":
        return new Set(this.readValues(this.readInteger()));

      case ">":
        return this.readValues(this.readInteger());

      case "|":
        // Attributes describe the next value: skip them and return that value.
        this.readPairs(this.readInteger());
        return this.readValue();

      default:
        throw new Error(
          `Unknown RESP type marker "${marker}" at offset ${this.offset - 1}`,
        );
    }
  }

  private readValues(count: number): RespValue[] {
    const values: RespValue[] = [];
    for (let i = 0; i < count; i++) values.push(this.readValue());
    return values;
  }

  private readPairs(count: number): Array<[RespValue, RespValue]> {
    const pairs: Array<[RespValue, RespValue]> = [];
    for (let i = 0; i < count; i++) {
      pairs.push([this.readValue(), this.readValue()]);
    }
    return pairs;
  }

  private readInteger(): number {
    const text = this.readLine();
    if (!/^[+-]?\d+$/.test(text)) throw new Error(`Invalid integer "${text}"`);
    return Number(text);
  }

  private readDouble(): number {
    const text = this.readLine().toLowerCase();
    if (text === "inf" || text === "+inf") return Infinity;
    if (text === "-inf") return -Infinity;
    if (text === "nan") return NaN;
    if (!/^[+-]?\d+(\.\d+)?(e[+-]?\d+)?$/.test(text)) {
      throw new Error(`Invalid double "${text}"`);
    }
    return Number(text);
  }

  private readBigNumber(): bigint {
    const text = this.readLine();
    if (!/^[+-]?\d+$/.test(text)) {
      throw new Error(`Invalid big number "${text}"`);
    }
    return BigInt(text);
  }

  private readByte(): number {
    if (this.offset >= this.input.length) throw new IncompleteInput();
    return this.input[this.offset++];
  }

  /** Read up to the next CRLF and return the text between them. */
  private readLine(): string {
    for (let i = this.offset; i + 1 < this.input.length; i++) {
      if (this.input[i] === CR && this.input[i + 1] === LF) {
        const line = this.decoder.decode(this.input.subarray(this.offset, i));
        this.offset = i + 2;
        return line;
      }
    }
    throw new IncompleteInput();
  }

  /** Read exactly `length` bytes followed by CRLF. */
  private readPayload(length: number): Uint8Array {
    if (length < 0) throw new Error(`Invalid length ${length}`);

    const end = this.offset + length;
    if (end + 2 > this.input.length) throw new IncompleteInput();
    if (this.input[end] !== CR || this.input[end + 1] !== LF) {
      throw new Error(`Payload of ${length} bytes is not terminated by CRLF`);
    }

    const payload = this.input.subarray(this.offset, end);
    this.offset = end + 2;
    return payload;
  }
}
