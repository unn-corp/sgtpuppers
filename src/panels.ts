import type { Panel, Store } from "./store.js";
export function messageFailure(
  error: unknown,
): "deleted" | "forbidden" | "retry" {
  const code = (error as { code?: number })?.code;
  return code === 10008 || code === 10003
    ? "deleted"
    : code === 50001 || code === 50013
      ? "forbidden"
      : "retry";
}
export class Panels {
  private tail: Promise<unknown> = Promise.resolve();
  private sent = new Map<string, string>();
  private suspended = new Set<string>();
  private retryAt = new Map<string, number>();
  constructor(private store: Store) {}
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => {});
    return result;
  }
  async update(
    payload: string,
    send: (panel: Panel) => Promise<unknown>,
    accept: (panel: Panel) => boolean,
    now = Date.now(),
  ) {
    return this.exclusive(async () => {
      for (const panel of [...this.store.state.panels]) {
        if (
          !accept(panel) ||
          this.suspended.has(panel.messageId) ||
          now < (this.retryAt.get(panel.messageId) || 0) ||
          this.sent.get(panel.messageId) === payload
        )
          continue;
        try {
          await send(panel);
          this.sent.set(panel.messageId, payload);
          this.retryAt.delete(panel.messageId);
        } catch (e) {
          const kind = messageFailure(e);
          if (kind === "deleted") {
            this.store.state.panels = this.store.state.panels.filter(
              (p) => p !== panel,
            );
            await this.store.save();
          } else if (kind === "forbidden") this.suspended.add(panel.messageId);
          else this.retryAt.set(panel.messageId, now + 60_000);
          console.warn(
            JSON.stringify({
              event: "panel_update_failed",
              channelId: panel.channelId,
              kind,
            }),
          );
        }
      }
    });
  }
  resume(messageId: string) {
    this.suspended.delete(messageId);
    this.sent.delete(messageId);
    this.retryAt.delete(messageId);
  }
}
