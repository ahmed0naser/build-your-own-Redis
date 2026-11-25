import * as net from "net";
import { parse } from "./parser";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

// Uncomment the code below to pass the first stage
const server: net.Server = net.createServer((connection: net.Socket) => {
  // Handle connection
  connection.on("data", (data: Buffer) => {
    if (data.toString() === "+PING\r\n") {
      connection.write("+PONG\r\n");
    }
    let buffer;

    let value;
    try {
      value = parse(data);
    } catch (error) {
      connection.write("-ERR Protocol error\r\n");
      buffer = Buffer.alloc(0);
      return;
    }

    if (value === undefined) {
      return; // incomplete, wait for the next chunk
    }

    buffer = Buffer.alloc(0); // command fully parsed

    // commands are arrays of strings: ["ECHO", "hello"]
    if (Array.isArray(value)) {
      const [name, ...args] = value;

      if (typeof name === "string" && name.toUpperCase() === "ECHO") {
        const message = String(args[0] ?? "");

        // Reply must be a bulk string, length counted in bytes.
        const payload = Buffer.from(message);
        connection.write(
          Buffer.concat([
            Buffer.from(`$${payload.length}\r\n`),
            payload,
            Buffer.from("\r\n"),
          ]),
        );
      }
    }
  });
});
server.listen(6379, "127.0.0.1");
