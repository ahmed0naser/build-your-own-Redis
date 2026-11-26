import * as net from "net";
import { parse, bulk, simple, err } from "./parser";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

// Uncomment the code below to pass the first stage
const server: net.Server = net.createServer((connection: net.Socket) => {
  // Handle connection
  let buffer = Buffer.alloc(0);
  connection.on("data", (data: Buffer) => {
    buffer = Buffer.concat([buffer, data]);
    while (true) {
      try {
        const result = parse(buffer);
        if (!result) break;

        buffer = buffer.subarray(result.next);

        const [name, ...args] = result.value as string[];
        const cmd = name.toLowerCase();
        if (cmd === "ping") {
          connection.write(simple("PONG"));
        } else if (cmd === "echo") {
          connection.write(bulk(args[0]));
        } else {
          connection.write(err(`ERR unknown command ${name}`));
        }
      } catch (e) {
        connection.write(err(`ERR unknown type`));
      }
    }
  });
});
server.listen(6379, "127.0.0.1");
