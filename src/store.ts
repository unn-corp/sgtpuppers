import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { Catalog } from "./model.js";
export type Panel = {
  guildId: string;
  channelId: string;
  messageId: string;
  serverKey: string;
};
export type State = {
  panels: Panel[];
  catalogs: Record<string, { at: number; items: Catalog }>;
};
export class Store {
  state: State = { panels: [], catalogs: {} };
  private tail = Promise.resolve();
  constructor(private dir: string) {}
  async load() {
    await mkdir(this.dir, { recursive: true });
    try {
      const data = JSON.parse(
        await readFile(join(this.dir, "state.json"), "utf8"),
      );
      if (
        !Array.isArray(data.panels) ||
        !data.catalogs ||
        data.panels.some(
          (p: Panel) =>
            !p ||
            !["guildId", "channelId", "messageId", "serverKey"].every(
              (k) =>
                typeof (p as unknown as Record<string, unknown>)[k] ===
                "string",
            ),
        )
      )
        throw new Error("Invalid state.json");
      this.state = data;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  save() {
    const body = JSON.stringify(this.state, null, 2);
    const operation = this.tail.then(async () => {
      const path = join(this.dir, "state.json");
      await writeFile(`${path}.tmp`, body);
      await rename(`${path}.tmp`, path);
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}
