import * as net from "net";
import { parse, bulk, simple, err, nullBulkStr } from "./resp";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

// Uncomment the code below to pass the first stage
type Entry = { value: string; expiresAt: number | null };
const store = new Map<string, Entry>();
const server: net.Server = net.createServer((connection: net.Socket) => {
  // Handle connection
  let buffer = Buffer.alloc(0);
  connection.on("data", (data: Buffer) => {
    buffer = Buffer.concat([buffer, data]);
    while (true) {
      let result;
      try {
        result = parse(buffer);
      } catch {
        connection.write(err("Protocol error"));
        connection.end();
        buffer = Buffer.alloc(0);
        return;
      }
      if (!result) break;

      buffer = buffer.subarray(result.next);
      const command = result.value;
      if (!Array.isArray(command) || typeof command[0] !== "string") {
        connection.write(err("invalid command format"));
        continue;
      }
      const [name, ...args] = command as string[];

      const cmd = name.toLowerCase();
      if (cmd === "ping") {
        connection.write(simple("PONG"));
      } else if (cmd === "echo") {
        if (args.length !== 1) {
          connection.write(err("wrong number of arguments for 'echo' command"));
        } else {
          connection.write(bulk(args[0]));
        }
      } else if (cmd === "set") {
        if (args.length < 2) {
          connection.write(err("wrong number of arguments for 'set' command"));
        } else {
          if (args.length === 2) {
            store.set(args[0], { value: args[1], expiresAt: null });
            connection.write(simple("OK"));
          } else {
            const ms = parseInt(args[3], 10);
            if (
              args.length === 4 &&
              args[2].toLowerCase() === "px" &&
              !Number.isNaN(ms) &&
              ms > 0
            ) {
              store.set(args[0], {
                value: args[1],
                expiresAt: Date.now() + ms,
              });
              connection.write(simple("OK"));
            } else {
              connection.write(err("syntax error"));
            }
          }
        }
      } else if (cmd === "get") {
        if (args.length !== 1)
          connection.write(err("wrong number of arguments for 'get' command"));
        else {
          const res = store.get(args[0]);
          if (
            res !== undefined &&
            res.expiresAt !== null &&
            res.expiresAt <= Date.now()
          ) {
            store.delete(args[0]); // expired: remove it, then treat as missing
            connection.write(nullBulkStr());
          } else if (res === undefined) {
            connection.write(nullBulkStr());
          } else {
            connection.write(bulk(res.value));
          }
        }
      }
      //
      else {
        connection.write(err(`unknown command '${name}'`));
      }
    }
  });
});
server.listen(6379, "127.0.0.1");
