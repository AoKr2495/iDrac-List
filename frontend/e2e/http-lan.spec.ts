import { test, expect } from "@playwright/test";
import { uuidV4 } from "../src/uuid";
import { createServer, request as forward } from "node:http";
import type { AddressInfo } from "node:net";

// The browser sees a genuine HTTP IP origin, never a trustworthy localhost.
// A local forward proxy sends it only to our test server, never to a NAS.
test("HTTP non-secure origin renders and saves with randomUUID absent", async ({
  playwright,
}) => {
  const port = process.env.IDRAC_TEST_PORT || "8089";
  const proxy = createServer((incoming, outgoing) => {
    const target = new URL(incoming.url!);
    if (target.hostname !== "192.0.2.205") {
      outgoing.writeHead(403);
      outgoing.end();
      return;
    }
    const upstream = forward(
      {
        hostname: "127.0.0.1",
        port,
        path: target.pathname + target.search,
        method: incoming.method,
        headers: { ...incoming.headers, host: `127.0.0.1:${port}` },
      },
      (response) => {
        outgoing.writeHead(response.statusCode!, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    outgoing.on("close", () => upstream.destroy());
    incoming.pipe(upstream);
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const browser = await playwright.chromium.launch({
    proxy: {
      server: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`,
    },
  });
  const page = await browser.newPage();
  try {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://192.0.2.205:${port}/`);
    expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
    expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe(
      "undefined",
    );
    expect(await page.evaluate(() => typeof crypto.getRandomValues)).toBe(
      "function",
    );
    await expect(page.getByText("Live · NAS")).toBeVisible();
    const pkf = "PKF26GR" + String(90000 + Math.floor(Math.random() * 9000)),
      sn = "HTTP-" + uuidV4().slice(0, 8);
    const writes: { client: string; request: string; operation: string }[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST")
        writes.push({
          client: r.headers()["x-client-id"],
          request: r.headers()["x-request-id"],
          operation: r.postDataJSON().operation_id,
        });
    });
    await page.getByRole("button", { name: "Add PKF", exact: true }).click();
    await page.getByLabel("PKF number").fill(pkf);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByLabel("Add Server " + pkf).fill(sn);
    await page.getByLabel("Add Server " + pkf).press("Enter");
    await expect(page.getByLabel("SN " + sn, { exact: true })).toBeVisible();
    await page.getByLabel("Edit Status " + sn).click();
    await page.getByLabel("Current status").fill("LAN HTTP save");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.locator("#" + pkf).getByText("LAN HTTP save"),
    ).toBeVisible();
    await page.getByLabel("PKF note " + pkf).fill("HTTP PKF note");
    await page
      .locator("#" + pkf)
      .getByRole("heading", { name: pkf, exact: true })
      .click();
    await expect(page.getByLabel("PKF note " + pkf)).toHaveValue(
      "HTTP PKF note",
    );
    await page.getByLabel("Toggle theme").click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByText("Live · NAS")).toBeVisible();
    await expect(page.getByLabel("PKF note " + pkf)).toHaveValue(
      "HTTP PKF note",
    );
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(writes.length).toBeGreaterThanOrEqual(2);
    for (const write of writes) {
      expect(write.client).toMatch(uuid);
      expect(write.request).toMatch(uuid);
      expect(write.operation).toMatch(uuid);
    }
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});

test("UUID helper has RFC v4 bits and no duplicates", () => {
  const values = Array.from({ length: 10000 }, () => uuidV4());
  expect(new Set(values).size).toBe(values.length);
  for (const id of values)
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
});
