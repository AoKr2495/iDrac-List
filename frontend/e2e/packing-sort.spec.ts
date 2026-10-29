import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { uuidV4 } from "../src/uuid";
const post = async (
  api: APIRequestContext,
  path: string,
  data: Record<string, unknown>,
) => {
  const r = await api.post("/api" + path, {
    data: { operation_id: uuidV4(), ...data },
  });
  expect(r.ok()).toBeTruthy();
  return r.json();
};
const state = async (api: APIRequestContext) =>
  (await api.get("/api/state")).json();
async function create(api: APIRequestContext) {
  const pkf = `PKF26GR${String(Math.floor(Math.random() * 90000) + 1000).padStart(5, "0")}`;
  return (
    await post(api, "/servers", { pkf, sn: "SORT-" + uuidV4().slice(0, 8) })
  ).record;
}
async function ready(p: Page) {
  await p.goto("/");
  await expect(p.getByText("Live · NAS")).toBeVisible();
}
async function keyboardMove(p: Page) {
  const d = p.getByRole("dialog");
  const first = d.getByRole("button", { name: /Reorder/ }).first();
  const label = await first.getAttribute("aria-label");
  const handle = d.getByLabel(label!, { exact: true });
  await handle.focus();
  await handle.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await p.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await handle.press("ArrowDown");
  await p.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await handle.press("Space");
  await expect(handle).not.toHaveAttribute("aria-pressed", "true");
}

test("sort keyboard draft Cancel Escape close, Save persistence, note and SSE conflict Reload", async ({
  page,
  browser,
  request,
}) => {
  const a = await create(request);
  await create(request);
  await post(request, `/pkfs/${a.pkf}/note`, { text: "SORT NOTE " + a.pkf });
  await ready(page);
  await expect(
    page.locator(".group-header").getByRole("button", { name: /Reorder/ }),
  ).toHaveCount(0);
  const before = await state(request);
  const open = () =>
    page.getByRole("button", { name: "Sort PKFs", exact: true }).click();
  await open();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".sort-item")).toHaveCount(
    before.active_order.length,
  );
  await expect(
    dialog.getByText("SORT NOTE " + a.pkf, { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await keyboardMove(page);
  expect((await state(request)).active_order).toEqual(before.active_order);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await state(request)).active_order).toEqual(before.active_order);
  await open();
  await keyboardMove(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await open();
  await keyboardMove(page);
  await dialog.getByLabel("Close dialog").click();
  expect((await state(request)).active_order).toEqual(before.active_order);
  await open();
  await keyboardMove(page);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await state(request);
  expect(saved.active_order.slice(0, 2)).toEqual(
    before.active_order.slice(0, 2).reverse(),
  );
  await page.reload();
  await expect(page.locator(".pkf-group").first()).toHaveAttribute(
    "id",
    saved.active_order[0],
  );
  const other = await browser.newPage();
  await ready(other);
  await open();
  await keyboardMove(page);
  await post(request, "/pkfs/order", {
    pkfs: [...saved.active_order].reverse(),
    base_version: saved.order_version,
  });
  await expect(dialog.locator("p[role=status]")).toContainText(
    "列表已发生变化",
  );
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Reload");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await expect(other.locator(".pkf-group").first()).toHaveAttribute(
    "id",
    saved.active_order.at(-1),
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await other.close();
});

test("sort pointer drag stays draft, failed save retains draft; remote membership detected", async ({
  page,
  request,
}) => {
  await create(request);
  await create(request);
  await ready(page);
  await page.getByRole("button", { name: "Sort PKFs", exact: true }).click();
  const d = page.getByRole("dialog");
  const before = await state(request);
  const handles = d.getByRole("button", { name: /Reorder/ });
  const a = await handles.nth(0).boundingBox(),
    b = await handles.nth(1).boundingBox();
  await page.mouse.move(a!.x + 12, a!.y + 12);
  await page.mouse.down();
  await page.mouse.move(b!.x + 12, b!.y + 22, { steps: 12 });
  await page.mouse.up();
  await expect(
    d.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  expect((await state(request)).active_order).toEqual(before.active_order);
  await page.route("**/api/pkfs/order", (r) =>
    r.request().method() === "POST"
      ? r.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            code: "order_conflict",
            message: "保存失败，请 Reload",
          }),
        })
      : r.continue(),
  );
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("保存失败");
  await expect(d.locator(".sort-item").first().locator("strong")).toHaveText(
    before.active_order[1],
  );
  await create(request);
  await expect(d.locator("p[role=status]")).toContainText("列表已发生变化");
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("Packing shares Status, completion, return reset, group order, history and two-client SSE", async ({
  page,
  browser,
  request,
}) => {
  const row = await create(request);
  await post(request, `/pkfs/${row.pkf}/note`, { text: "SHARED NOTE" });
  const other = await browser.newPage();
  await ready(page);
  await ready(other);
  const p = (
    await post(request, `/servers/${row.id}/progress`, {
      generation: 0,
      stage: 4,
      state: "Success",
      confirmed: true,
    })
  ).record;
  for (const client of [page, other]) {
    await client.getByRole("button", { name: "Packing", exact: true }).click();
    await expect(client.locator("#" + row.pkf)).toBeVisible();
  }
  const group = page.locator("#" + row.pkf);
  await expect(group.getByLabel("PKF note " + row.pkf)).toHaveAttribute(
    "readonly",
    "",
  );
  await group.getByLabel("Edit Status " + row.sn).click();
  await page.getByLabel("Current status").fill("Packed carefully");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(
    other.locator("#" + row.pkf).getByLabel("Edit Status " + row.sn),
  ).toHaveText("Packed carefully");
  await group
    .getByRole("button", { name: "Packing Success", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(group).toBeVisible();
  await group
    .getByRole("button", { name: "Packing Success", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(group).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(group.getByText(row.sn, { exact: true })).toBeVisible();
  await group.getByLabel("Status History " + row.sn).click();
  await expect(
    page.getByRole("dialog").getByText("Packed carefully", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await group.locator("tr[data-server-id]").hover();
  await group.getByLabel("Actions " + row.sn).click();
  await page
    .getByRole("button", { name: "Return to Active", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(group.getByText("Not Started", { exact: true })).toBeVisible();
  let snap = await state(request);
  let r = snap.servers.find((x: any) => x.id === row.id);
  expect(r.status_history).toHaveLength(1);
  expect(snap.active_order.at(-1)).toBe(row.pkf);
  r = (
    await post(request, `/servers/${r.id}/progress`, {
      generation: r.generation,
      stage: 4,
      state: "Success",
      confirmed: true,
    })
  ).record;
  await page.getByRole("button", { name: "Packing", exact: true }).click();
  await expect(group).toBeVisible();
  await group.locator("tr[data-server-id]").hover();
  await group.getByLabel("Actions " + row.sn).click();
  await page
    .getByRole("button", { name: "Return to Active", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(group.getByText("Not Started", { exact: true })).toBeVisible();
  await other.close();
});

test("touch handle drag, keyboard drag cancel and long-list scroll keep modal controls visible", async ({
  browser,
  request,
}) => {
  for (let i = 0; i < 12; i++) await create(request);
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 800 },
  });
  const p = await context.newPage();
  await ready(p);
  await p.getByRole("button", { name: "Sort PKFs", exact: true }).click();
  const d = p.getByRole("dialog");
  const handles = d.getByRole("button", { name: /Reorder/ });
  await handles.first().scrollIntoViewIfNeeded();
  const first = await handles.nth(0).boundingBox(),
    second = await handles.nth(1).boundingBox();
  const cdp = await context.newCDPSession(p);
  const x = first!.x + 16,
    y = first!.y + 16;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await p.waitForTimeout(220);
  for (let i = 1; i <= 8; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + ((second!.y - first!.y) * i) / 8 }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(
    d.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  const handle = handles.first();
  await handle.focus();
  await handle.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await handle.press("Escape");
  await expect(d).toBeVisible();
  await expect(handle).not.toHaveAttribute("aria-pressed", "true");
  await d.locator(".sort-list").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    d.getByRole("button", { name: "Save", exact: true }),
  ).toBeInViewport();
  await expect(
    d.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeInViewport();
  await p.keyboard.press("Escape");
  await expect(d).toHaveCount(0);
  await context.close();
});

test("Packing and History descending groups ignore Active manual order; Packing rows newest first", async ({
  page,
  request,
}) => {
  const a = await create(request),
    b = await create(request);
  const sibling = (
    await post(request, "/servers", {
      pkf: a.pkf,
      sn: "SIBLING-" + uuidV4().slice(0, 8),
    })
  ).record;
  const first = (
    await post(request, `/servers/${a.id}/progress`, {
      generation: 0,
      stage: 4,
      state: "Success",
      confirmed: true,
    })
  ).record;
  await post(request, `/servers/${b.id}/progress`, {
    generation: 0,
    stage: 4,
    state: "Success",
    confirmed: true,
  });
  await post(request, `/servers/${sibling.id}/progress`, {
    generation: 0,
    stage: 4,
    state: "Success",
    confirmed: true,
  });
  const snap = await state(request);
  await post(request, "/pkfs/order", {
    pkfs: [...snap.active_order].reverse(),
    base_version: snap.order_version,
  });
  await ready(page);
  await page.getByRole("button", { name: "Packing", exact: true }).click();
  const ids = await page
    .locator(".pkf-group")
    .evaluateAll((nodes) => nodes.map((n) => n.id));
  expect(ids).toEqual([...ids].sort().reverse());
  const rows = page.locator("#" + a.pkf).locator("tr[data-server-id]");
  await expect(rows.first()).toHaveAttribute("data-server-id", sibling.id);
  await post(request, `/servers/${a.id}/packing`, {
    generation: first.generation,
    confirmed: true,
  });
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.locator("#" + a.pkf)).toBeVisible();
  const historyIds = await page
    .locator(".pkf-group")
    .evaluateAll((nodes) => nodes.map((n) => n.id));
  expect(historyIds).toEqual([...historyIds].sort().reverse());
});

test("Packing duplicate offers View Packing Cancel Return only and keeps readonly identity", async ({
  page,
  request,
}) => {
  const row = await create(request);
  await post(request, `/servers/${row.id}/progress`, {
    generation: 0,
    stage: 4,
    state: "Success",
    confirmed: true,
  });
  await ready(page);
  await page.getByRole("button", { name: "Add PKF", exact: true }).click();
  await page.getByLabel("PKF number").fill(row.pkf);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const group = page.locator("#" + row.pkf);
  await group.getByLabel("Add Server " + row.pkf).fill(row.sn);
  await group.getByLabel("Add Server " + row.pkf).press("Enter");
  await expect(
    page.getByRole("heading", { name: "Server already in Packing" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Anyway" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "View Packing", exact: true }).click();
  await expect(
    group.getByRole("button", { name: "Packing Success", exact: true }),
  ).toBeVisible();
  await expect(group.getByLabel("SN " + row.sn, { exact: true })).toHaveCount(
    0,
  );
});
