import {
  parseStatus,
  type Snapshot,
  type Rotation,
  type Catalog,
} from "./model.js";
import type { Store } from "./store.js";
export function retryAfter(value: string | null, now: number) {
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(0, seconds * 1000)
    : Math.max(0, Date.parse(value) - now) || 0;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public retryMs = 0,
  ) {
    super(`Wardogs HTTP ${status}`);
  }
}
export class WardogsClient {
  constructor(
    private url: string,
    private password: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  async get(path: string): Promise<unknown> {
    // Deliberately no general HTTP method or raw command facility.
    if (
      !/^\/v1\/(status|capabilities|rotation|server-id|catalog\/(maps|experiences|lightings))$/.test(
        path,
      )
    )
      throw new Error("Unsupported read path");
    const response = await this.fetcher(this.url + path, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.password}` },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!response.ok)
      throw new ApiError(
        response.status,
        retryAfter(response.headers.get("retry-after"), Date.now()),
      );
    return response.json();
  }
}
export class Poller {
  snapshot: Snapshot = { failed: false };
  blockedUntil = 0;
  authFailed = false;
  private busy = false;
  private failures = 0;
  private nextRequest = 0;
  private nextStatus = 0;
  private due: Record<string, number> = {
    capabilities: 0,
    rotation: 0,
    "server-id": 0,
    "catalog/maps": 0,
    "catalog/experiences": 0,
    "catalog/lightings": 0,
  };
  private disabled = new Set<string>();
  constructor(
    private api: Pick<WardogsClient, "get">,
    private store: Store,
    private now = Date.now,
    private random = Math.random,
  ) {
    this.snapshot.catalogs = Object.fromEntries(
      Object.entries(store.state.catalogs).map(([key, value]) => [
        key,
        value.items,
      ]),
    );
    for (const path of [
      "catalog/maps",
      "catalog/experiences",
      "catalog/lightings",
    ])
      this.due[path] = (store.state.catalogs[path]?.at || 0) + 86_400_000;
  }
  async tick() {
    const now = this.now();
    if (
      this.busy ||
      this.authFailed ||
      now < this.blockedUntil ||
      now < this.nextRequest
    )
      return;
    const path =
      now >= this.nextStatus
        ? "status"
        : Object.keys(this.due).find(
            (p) => !this.disabled.has(p) && now >= this.due[p]!,
          );
    if (!path) return;
    this.busy = true;
    try {
      const raw = await this.api.get(`/v1/${path}`);
      const at = this.now();
      if (path === "status") {
        const status = parseStatus(raw);
        const changed =
          JSON.stringify([status.map, status.rotation]) !==
          JSON.stringify([
            this.snapshot.status?.map,
            this.snapshot.status?.rotation,
          ]);
        if (changed) {
          this.due.rotation = 0;
          if (this.snapshot.rotation) this.snapshot.rotationFailed = true;
        }
        if (this.snapshot.failed) this.due["server-id"] = 0;
        this.snapshot = {
          ...this.snapshot,
          status,
          updatedAt: at,
          failed: false,
        };
        this.nextStatus = at + 60_000;
      } else if (path === "rotation") {
        const r = raw as Rotation;
        if (
          !r ||
          typeof r.enabled !== "boolean" ||
          !Array.isArray(r.entries) ||
          r.entries.some(
            (e) =>
              !e ||
              !Number.isInteger(e.index) ||
              typeof e.map !== "string" ||
              !Array.isArray(e.experiences) ||
              e.experiences.some((x) => typeof x !== "string"),
          )
        )
          throw new Error("Invalid rotation");
        this.snapshot = {
          ...this.snapshot,
          rotation: r,
          rotationAt: at,
          rotationFailed: false,
        };
        this.due[path] = at + 300_000;
      } else if (path === "server-id") {
        const id = (raw as { serverId?: unknown })?.serverId;
        if (
          typeof id !== "string" ||
          !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id)
        )
          throw new Error("Invalid server ID");
        this.snapshot = {
          ...this.snapshot,
          joinCode: id,
          joinAt: at,
          joinFailed: false,
        };
        this.due[path] = at + 300_000;
      } else if (path === "capabilities") {
        const routes = (raw as { routes?: unknown })?.routes;
        if (!Array.isArray(routes) || routes.some((r) => typeof r !== "string"))
          throw new Error("Invalid capabilities");
        for (const optional of Object.keys(this.due))
          if (
            optional !== "capabilities" &&
            !routes.includes(`GET /v1/${optional}`)
          )
            this.disabled.add(optional);
        this.due[path] = Infinity;
      } else {
        const key = path.split("/")[1]!;
        const items = (raw as Record<string, unknown>)?.[key] as Catalog;
        if (
          !Array.isArray(items) ||
          items.some(
            (x) =>
              !x ||
              typeof x.id !== "string" ||
              typeof x.displayName !== "string",
          )
        )
          throw new Error("Invalid catalog");
        this.store.state.catalogs[path] = { at, items };
        this.snapshot.catalogs![path] = items;
        this.due[path] = at + 86_400_000;
        await this.store.save();
      }
      this.failures = 0;
      this.blockedUntil = 0;
    } catch (error) {
      const at = this.now();
      if (path === "status") {
        this.snapshot.failed = true;
        this.nextStatus = at + 60_000;
      }
      if (path === "rotation") this.snapshot.rotationFailed = true;
      if (path === "server-id") this.snapshot.joinFailed = true;
      if (path !== "status") this.due[path] = at + 300_000;
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        this.authFailed = true;
        this.snapshot.failed = true;
        console.error(
          "Wardogs authentication failed; correct configuration and restart.",
        );
      } else if (
        error instanceof ApiError &&
        error.status === 404 &&
        path !== "status"
      )
        this.disabled.add(path);
      else if (
        path === "status" ||
        !(error instanceof ApiError) ||
        error.status === 429 ||
        error.status >= 500
      ) {
        const backoff =
          Math.min(300_000, 60_000 * 2 ** Math.min(this.failures++, 3)) *
          (1 + this.random() * 0.1);
        this.blockedUntil =
          at + Math.max(backoff, error instanceof ApiError ? error.retryMs : 0);
      }
      console.warn(
        JSON.stringify({
          event: "wardogs_read_failed",
          path,
          status: error instanceof ApiError ? error.status : undefined,
          retryAt: this.blockedUntil || undefined,
        }),
      );
    } finally {
      this.busy = false;
      this.nextRequest = this.now() + 5000;
    }
  }
}
