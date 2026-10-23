import { test } from "node:test";
import assert from "node:assert/strict";
import { constants } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { TLSSocket } from "node:tls";
import { REST } from "discord.js";
import { Agent } from "undici";

// These public test keys/certificates belong only to the loopback fixture.
const fixture = (file: string) =>
  readFileSync(new URL(`../../test/fixtures/tls/${file}`, import.meta.url));

test("Discord REST survives a TLS certificate change and rejects the request", async (t) => {
  const server = createServer(
    {
      key: fixture("valid.key"),
      cert: fixture("valid.pem"),
      minVersion: "TLSv1.2",
      maxVersion: "TLSv1.2",
      secureOptions: constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION,
    },
    (request, response) => {
      assert.equal(request.method, "GET");
      assert.equal(request.headers.authorization, "Bot synthetic-test-token");
      if (request.url === "/v10/ordinary") {
        response.setHeader("content-type", "application/json");
        response.end('{"ok":true}');
        return;
      }
      assert.equal(request.url, "/v10/renegotiate");
      assert.ok(request.socket instanceof TLSSocket);
      request.socket.setKeyCert({
        key: fixture("wrong.key"),
        cert: fixture("wrong.pem"),
      });
      assert.equal(
        request.socket.renegotiate({}, () => {}),
        true,
      );
    },
  );
  server.on("tlsClientError", () => {});
  const agent = new Agent({ connect: { ca: fixture("ca.pem") } });
  t.after(async () => {
    await agent.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const rest = new REST({
    api: `https://127.0.0.1:${address.port}`,
    version: "10",
    retries: 0,
    timeout: 3000,
  })
    .setToken("synthetic-test-token")
    .setAgent(agent);
  assert.deepEqual(await rest.get("/ordinary"), { ok: true });
  // GHSA-qrxm-fqhp-jwvm: an established TLS socket error must reject rather
  // than become an uncaught Undici assertion that terminates the bot.
  await assert.rejects(rest.get("/renegotiate"), {
    code: "ERR_TLS_CERT_ALTNAME_INVALID",
  });
});
