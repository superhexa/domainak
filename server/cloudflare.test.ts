import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

process.env.CLOUDFLARE_API_TOKEN = "test-token";

type CloudflareModule = typeof import("./cloudflare");

let cf: CloudflareModule;

beforeAll(async () => {
  cf = await import("./cloudflare");
});

interface Call {
  url: string;
  method: string;
  body: unknown;
}

let calls: Call[] = [];
let zoneNames: string[] = ["example.com"];
let existingRecords: Record<string, unknown>[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  calls = [];
  zoneNames = ["example.com"];
  existingRecords = [];
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    let body: unknown = null;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      body = null;
    }
    calls.push({ url, method, body });

    if (url.includes("/zones?")) {
      return jsonResponse({
        success: true,
        result: zoneNames.map((name, index) => ({
          id: `zone-${index}`,
          name,
        })),
      });
    }
    if (url.includes("/dns_records?name=")) {
      return jsonResponse({ success: true, result: existingRecords });
    }
    if (method === "POST" && url.endsWith("/dns_records")) {
      return jsonResponse({
        success: true,
        result: { id: "cf-new", ...(body as object) },
      });
    }
    return jsonResponse({ success: true, result: {} });
  }) as typeof fetch;
});

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("upsertCloudflareRecord", () => {
  test("creates a DNS-only record in the longest-matching zone", async () => {
    const id = await cf.upsertCloudflareRecord({
      type: "A",
      name: "www.app.example.com",
      content: "203.0.113.10",
      ttl: 300,
      comment: "hello",
    });
    expect(id).toBe("cf-new");
    const create = calls.find((call) => call.method === "POST");
    expect(create?.body).toMatchObject({
      type: "A",
      name: "www.app.example.com",
      content: "203.0.113.10",
      ttl: 300,
      proxied: false,
      comment: "hello",
    });
  });

  test("adopts an identical existing record instead of duplicating", async () => {
    existingRecords = [
      {
        id: "cf-old",
        type: "A",
        name: "www.app.example.com",
        content: "203.0.113.10",
        proxied: false,
        ttl: 300,
      },
    ];
    const id = await cf.upsertCloudflareRecord({
      type: "A",
      name: "www.app.example.com",
      content: "203.0.113.10",
      ttl: 300,
    });
    expect(id).toBe("cf-old");
    expect(
      calls.some(
        (call) =>
          call.method === "POST" && call.url.endsWith("/dns_records"),
      ),
    ).toBe(false);
  });

  test("updates the stored id when it still exists", async () => {
    const id = await cf.upsertCloudflareRecord(
      {
        type: "TXT",
        name: "www.app.example.com",
        content: "v=spf1 -all",
        ttl: 300,
      },
      "cf-kept",
    );
    expect(id).toBe("cf-kept");
    expect(
      calls.some(
        (call) => call.method === "PUT" && call.url.endsWith("/cf-kept"),
      ),
    ).toBe(true);
  });

  test("no zone for the name throws a clear error", async () => {
    zoneNames = [];
    await expect(
      cf.upsertCloudflareRecord({
        type: "A",
        name: "www.other.example",
        content: "203.0.113.10",
        ttl: 300,
      }),
    ).rejects.toThrow("No Cloudflare zone found");
  });
});

describe("removeCloudflareRecord", () => {
  test("deletes by id and falls back to a name lookup on 404", async () => {
    const id = await cf.upsertCloudflareRecord({
      type: "A",
      name: "gone.app.example.com",
      content: "203.0.113.10",
      ttl: 300,
    });
    expect(id).toBe("cf-new");
    await cf.removeCloudflareRecord(
      "gone.app.example.com",
      "A",
      "cf-new",
      "203.0.113.10",
    );
    expect(
      calls.some(
        (call) => call.method === "DELETE" && call.url.endsWith("/cf-new"),
      ),
    ).toBe(true);
  });

  test("a missing zone means nothing is left to remove", async () => {
    zoneNames = [];
    await expect(
      cf.removeCloudflareRecord("x.other.example", "A", null),
    ).resolves.toBeUndefined();
  });
});
