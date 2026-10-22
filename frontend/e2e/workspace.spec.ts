import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { fileURLToPath } from "node:url";
import { uuidV4 } from "../src/uuid";
const artifact = (name: string) =>
  fileURLToPath(new URL("../../.cache/" + name, import.meta.url));
let counter = 81000 + Math.floor(Math.random() * 5000);
const pkf = () => `PKF26GR${++counter}`;
const requestBody = (data: Record<string, unknown>) => ({
  operation_id: uuidV4(),
  ...data,
});
async function create(
  api: APIRequestContext,
  group = pkf(),
  sn = "SN-" + uuidV4().slice(0, 8),
) {
  const r = await api.post("/api/servers", {
    data: requestBody({ pkf: group, sn }),
  });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).record;
}
async function change(
  api: APIRequestContext,
  row: any,
  action: string,
  extra: Record<string, unknown>,
) {
  const r = await api.post(`/api/servers/${row.id}/${action}`, {
    data: requestBody({ generation: row.generation, ...extra }),
  });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).record;
}
async function snapshot(api: APIRequestContext) {
  return (await api.get("/api/state")).json();
}
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Live · NAS")).toBeVisible();
}

test("full UI lifecycle: add, edit, status, progress, validation and return", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  const group = pkf(),
    sn = "UI-LIFECYCLE";
  await page.getByRole("button", { name: "Add PKF", exact: true }).click();
  await page.getByLabel("PKF number").fill(group);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const section = page.locator("#" + group);
  await section.getByLabel("Add Server " + group).fill(sn);
  await section.getByLabel("Add Server " + group).press("Enter");
  await expect(section.getByLabel("SN " + sn, { exact: true })).toBeVisible();
  await section.getByLabel("Model " + sn).selectOption("R660XS");
  await expect(section.getByLabel("Model " + sn)).toHaveValue("R660XS");
  await section.getByLabel("OS " + sn).selectOption("CTD");
  await expect(section.getByLabel("OS " + sn)).toHaveValue("CTD");
  await section.getByLabel("Edit Status " + sn).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let row = (await snapshot(request)).servers.find((r: any) => r.pkf === group);
  expect(row.status_history).toHaveLength(0);
  await section.getByLabel("Edit Status " + sn).click();
  await page.getByLabel("Current status").fill("Firmware prepared");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(section.getByText("Firmware prepared")).toBeVisible();
  await section.getByLabel("Edit Status " + sn).click();
  await page.getByLabel("Current status").fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await section.getByLabel("Status History " + sn, { exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("Firmware prepared"),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("—", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await section.getByLabel("Progress " + sn).click();
  await page
    .getByRole("menu", { name: "Progress options" })
    .getByText("Bios Set-up", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Fail", exact: true })
    .click();
  await expect(section.getByText("Bios Set-up · Fail")).toBeVisible();
  await section.getByLabel("Progress " + sn).click();
  await page
    .getByRole("menu")
    .getByText("Installation", { exact: true })
    .locator("..")
    .getByRole("button", { name: "ing", exact: true })
    .click();
  await expect(section.getByText("Installation · ing")).toBeVisible();
  await section.getByLabel("Progress " + sn).click();
  await page
    .getByRole("menu")
    .getByText("Validation", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Success", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirm Validation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(section.getByLabel("SN " + sn, { exact: true })).toBeVisible();
  await section.getByLabel("Progress " + sn).click();
  await page
    .getByRole("menu")
    .getByText("Validation", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Success", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(section).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(section.getByText(sn, { exact: true })).toBeVisible();
  await expect(section.getByLabel("Progress " + sn)).toHaveCount(0);
  await section.locator("tr[data-server-id]").hover();
  await section.getByLabel("Actions " + sn).click();
  await page
    .getByRole("button", { name: "Return to Active", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(section.getByLabel("SN " + sn, { exact: true })).toBeVisible();
  await expect(section.getByText("Not Started", { exact: true })).toBeVisible();
  row = (await snapshot(request)).servers.find((r: any) => r.id === row.id);
  expect(row.status_history).toHaveLength(2);
  expect(row.completed_at).toBeNull();
  expect(errors).toEqual([]);
});

test("SSE across clients, preserved draft, offline and fresh reconnect", async ({
  browser,
  request,
}) => {
  const row = await create(request);
  const a = await browser.newContext(),
    b = await browser.newContext();
  const one = await a.newPage(),
    two = await b.newPage();
  await ready(one);
  await ready(two);
  const draft = "LOCAL-DRAFT-" + row.sn;
  const input = one.getByLabel("SN " + row.sn, { exact: true });
  await input.fill(draft);
  await change(request, row, "edit", { changes: { model: "R450" } });
  await expect(two.getByLabel("Model " + row.sn)).toHaveValue("R450");
  await expect(one.getByLabel("Model " + row.sn)).toHaveValue("R450");
  await expect(input).toHaveValue(draft);
  await a.setOffline(true);
  await expect(one.getByText("Offline · 只读")).toBeVisible();
  await expect(input).toBeDisabled();
  await change(request, row, "edit", { changes: { os: "SRA" } });
  await a.setOffline(false);
  await expect(one.getByText("Live · NAS")).toBeVisible({ timeout: 15000 });
  await expect(one.getByLabel("OS " + row.sn)).toHaveValue("SRA");
  await expect(input).toHaveValue(draft);
  await input.press("Enter");
  await expect(one.getByLabel("SN " + draft, { exact: true })).toHaveValue(
    draft,
  );
  await expect(two.getByLabel("SN " + draft, { exact: true })).toBeVisible();
  await a.close();
  await b.close();
});

test("history duplicate has only allowed choices; deleted row cannot be edited", async ({
  page,
  request,
}) => {
  const row = await create(request);
  await change(request, row, "progress", {
    stage: 4,
    state: "Success",
    confirmed: true,
  });
  await ready(page);
  await page.getByRole("button", { name: "Add PKF", exact: true }).click();
  await page.getByLabel("PKF number").fill(row.pkf);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const section = page.locator("#" + row.pkf);
  await section.getByLabel("Add Server " + row.pkf).fill(row.sn);
  await section.getByLabel("Add Server " + row.pkf).press("Enter");
  await expect(
    page.getByRole("heading", { name: "Server already in History" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Anyway" })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Return to Active", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    section.getByLabel("SN " + row.sn, { exact: true }),
  ).toBeVisible();
  await section.locator("tr[data-server-id]").hover();
  await section.getByLabel("Actions " + row.sn).click();
  await page
    .getByRole("button", { name: "Delete Server", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    section.getByLabel("SN " + row.sn, { exact: true }),
  ).toBeVisible();
  await section.locator("tr[data-server-id]").hover();
  await section.getByLabel("Actions " + row.sn).click();
  await page
    .getByRole("button", { name: "Delete Server", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(section.getByLabel("SN " + row.sn, { exact: true })).toHaveCount(
    0,
  );
  const stale = await request.post(`/api/servers/${row.id}/edit`, {
    data: requestBody({
      generation: row.generation,
      changes: { sn: "resurrect" },
    }),
  });
  expect(stale.status()).toBe(410);
});

test("stale Status modal rejects after completed then returned lifecycle", async ({
  page,
  request,
}) => {
  const row = await create(request);
  await ready(page);
  await page.getByLabel("Edit Status " + row.sn).click();
  await page.getByLabel("Current status").fill("STALE");
  const h = await change(request, row, "progress", {
    stage: 4,
    state: "Success",
    confirmed: true,
  });
  await change(request, h, "return", { confirmed: true });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "生命周期已变化",
  );
  const state = await snapshot(request);
  expect(
    state.servers.find((s: any) => s.id === row.id).status_history,
  ).toHaveLength(0);
});

test("manual themes, sidebar and visual reference", async ({
  page,
  request,
}) => {
  const group = pkf();
  const a = await create(request, group, "QNAP-SERVER-01");
  await change(request, a, "edit", { changes: { model: "R660XS" } });
  await change(request, a, "edit", { changes: { os: "xDome" } });
  await change(request, a, "status", {
    text: "Firmware updated. Ready for installation.",
  });
  await change(request, a, "progress", { stage: 3, state: "ing" });
  await create(request, group, "QNAP-SERVER-02");
  await ready(page);
  await page.screenshot({
    path: artifact("active-light.png"),
    fullPage: false,
  });
  await page.getByLabel("Toggle theme").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText("Live · NAS")).toBeVisible();
  await page.screenshot({ path: artifact("active-dark.png"), fullPage: false });
  await page.getByLabel("Toggle sidebar").click();
  await expect(page.locator(".app")).toHaveClass(/sidebar-compact/);
  await page.getByLabel("Hide sidebar").click();
  await expect(page.getByLabel("Open sidebar")).toBeVisible();
  await page.getByLabel("Open sidebar").click();
  await expect(page.getByText("WORKSPACE", { exact: true })).toBeVisible();
});

test("portrait uses sidebar open button and retains complete desktop table", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await ready(page);
  await expect(page.getByLabel("Open sidebar")).toBeVisible();
  await page.getByLabel("Open sidebar").click();
  await expect(
    page.getByRole("button", { name: "Active", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Hide sidebar").click();
  await expect(page.getByLabel("Open sidebar")).toBeVisible();
});

test("PKF position toggles persist and a located group vanishes after final completion", async ({
  page,
  request,
}) => {
  const row = await create(request);
  await ready(page);
  const section = page.locator("#" + row.pkf);
  await section.locator(".group-header").hover();
  await section.getByLabel("Pin PKF", { exact: true }).click();
  await expect(section).toHaveClass(/pinned/);
  await page.reload();
  await expect(page.getByText("Live · NAS")).toBeVisible();
  await expect(section).toHaveClass(/pinned/);
  await section.locator(".group-header").hover();
  await section.getByLabel("Restore Normal", { exact: true }).click();
  await expect(section).toHaveClass(/normal/);
  await section.locator(".group-header").hover();
  await section.getByLabel("Move to Bottom", { exact: true }).click();
  await expect(section).toHaveClass(/bottom/);
  await section.locator(".group-header").hover();
  await section.getByLabel("Restore Normal", { exact: true }).click();
  await expect(section).toHaveClass(/normal/);
  await page.getByRole("button", { name: "Add PKF", exact: true }).click();
  await page.getByLabel("PKF number").fill(row.pkf);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(section).toHaveCount(1);
  await change(request, row, "progress", {
    stage: 4,
    state: "Success",
    confirmed: true,
  });
  await expect(section).toHaveCount(0);
});

test("configured prefix completes shorthand and configured reminder matches exact Model/OS", async ({
  page,
  request,
}) => {
  const row = await create(request);
  await change(request, row, "edit", { changes: { model: "R250" } });
  await change(request, row, "edit", { changes: { os: "xDome" } });
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch();
    const state = await response.json();
    state.pkf_default_prefix = "PKF27GR";
    state.validation_reminders = {
      default: ["通用检查提醒"],
      by_model_os: {
        R250: { xDome: ["请检查 R250 xDome 安装结果"] },
        R260: { CTD: ["不应显示的其他组合"] },
      },
    };
    await route.fulfill({ response, json: state });
  });
  await ready(page);
  await page.getByLabel("Progress " + row.sn).click();
  await page
    .getByRole("menu")
    .getByText("Validation", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Success", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Validation reminders")).toContainText(
    "通用检查提醒",
  );
  await expect(dialog.getByLabel("Validation reminders")).toContainText(
    "请检查 R250 xDome 安装结果",
  );
  await expect(dialog).not.toContainText("不应显示的其他组合");
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Confirm", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Add PKF", exact: true }).click();
  await page.getByLabel("PKF number").fill("468");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator("#PKF27GR00468")).toBeVisible();
});

test("PKF notes stay inline, synchronize, preserve offline draft and survive return", async ({
  browser,
  request,
}) => {
  const row = await create(request);
  const a = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    }),
    b = await browser.newContext();
  const one = await a.newPage(),
    two = await b.newPage();
  await ready(one);
  await ready(two);
  const section = one.locator("#" + row.pkf),
    header = section.locator(".group-header");
  const input = one.getByLabel("PKF note " + row.pkf, { exact: true }),
    other = two.getByLabel("PKF note " + row.pkf, { exact: true });
  const before = await header.boundingBox();
  await input.fill("客户要求：周五交付");
  await section.getByRole("heading", { name: row.pkf, exact: true }).click();
  await expect(other).toHaveValue("客户要求：周五交付");
  await expect(input).toHaveValue("客户要求：周五交付");
  const after = await header.boundingBox(),
    name = await section
      .getByRole("heading", { name: row.pkf, exact: true })
      .boundingBox(),
    field = await input.boundingBox();
  expect(after!.height).toBe(before!.height);
  expect(field!.x).toBeGreaterThan(name!.x + name!.width);
  expect(
    Math.abs(field!.y + field!.height / 2 - (name!.y + name!.height / 2)),
  ).toBeLessThan(3);
  await section.screenshot({ path: artifact("pkf-note-inline.png") });
  await input.fill("LOCAL NOTE DRAFT");
  const remote = await request.post(`/api/pkfs/${row.pkf}/note`, {
    data: requestBody({ text: "REMOTE NOTE" }),
  });
  expect(remote.ok()).toBeTruthy();
  await expect(other).toHaveValue("REMOTE NOTE");
  await expect(input).toHaveValue("LOCAL NOTE DRAFT");
  await a.setOffline(true);
  await expect(input).toBeDisabled();
  await a.setOffline(false);
  await expect(one.getByText("Live · NAS")).toBeVisible({ timeout: 15000 });
  await expect(input).toHaveValue("LOCAL NOTE DRAFT");
  await input.press("Enter");
  await expect(other).toHaveValue("LOCAL NOTE DRAFT");
  const h = await change(request, row, "progress", {
    stage: 4,
    state: "Success",
    confirmed: true,
  });
  await one.getByRole("button", { name: "History", exact: true }).click();
  await expect(input).toHaveValue("LOCAL NOTE DRAFT");
  await expect(input).toHaveAttribute("readonly", "");
  await change(request, h, "return", { confirmed: true });
  await one.getByRole("button", { name: "Active", exact: true }).click();
  await expect(input).toHaveValue("LOCAL NOTE DRAFT");
  await input.fill("");
  await section.getByRole("heading", { name: row.pkf, exact: true }).click();
  await expect(other).toHaveValue("");
  await a.close();
  await b.close();
});
