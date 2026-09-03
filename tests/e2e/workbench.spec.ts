import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { executeWebMcpTool, installWebMcpHarness } from "./webmcp-harness";

test("WebMCP harness stages a repair and the visible UI approves it", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await installWebMcpHarness(page);
  await page.goto("/");

  await expect(page.getByText("6 WebMCP tools live")).toBeVisible();
  await expect(page.locator(".asset-item")).toHaveCount(55);
  await expect(page.locator(".asset-item.is-selected")).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByTestId("source-code")).toContainText("#nip#");

  const catalog = await executeWebMcpTool<{
    total: number;
    returned: number;
    hasMore: boolean;
  }>(page, "list_official_assets", {});
  expect(catalog).toMatchObject({ total: 55, returned: 6, hasMore: true });
  await expect(
    page.getByRole("button", { name: "Manual demo fallback" }),
  ).toHaveCount(0);

  const validation = await executeWebMcpTool<{
    valid: boolean;
    findingCount: number;
  }>(page, "validate_workspace", {});
  expect(validation.valid).toBe(false);
  expect(validation.findingCount).toBeGreaterThan(0);
  await expect(page.getByText("Needs attention")).toBeVisible();

  const staged = await executeWebMcpTool<{
    status: string;
    proposalId: string;
    replacementCount: number;
  }>(page, "stage_exact_replacements", {
    summary: "Replace both official CIRFMF template placeholders",
    replacements: [
      {
        search: "#nip#",
        replacement: "1111111111",
        reason: "Schema-compatible demonstration NIP",
      },
      {
        search: "#invoice_number#",
        replacement: "FV/2026/001",
        reason: "Deterministic demonstration invoice number",
      },
    ],
  });
  expect(staged).toMatchObject({
    status: "pending-human-approval",
    replacementCount: 2,
  });
  await expect(
    page.getByRole("heading", { name: "Pending human approval" }),
  ).toBeVisible();
  await expect(page.getByTestId("source-code")).toContainText("#nip#");
  await expect(
    page.getByRole("button", { name: "Approve changes" }),
  ).toBeDisabled();

  const preflight = await executeWebMcpTool<{
    target: string;
    proposalId: string;
    valid: boolean;
    contentSha256: string;
  }>(page, "validate_workspace", { target: "pending-proposal" });
  expect(preflight).toMatchObject({
    target: "pending-proposal",
    proposalId: staged.proposalId,
    valid: true,
  });
  expect(preflight.contentSha256).toMatch(/^[a-f0-9]{64}$/u);
  await expect(page.getByText("Schema valid before approval")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve changes" }),
  ).toBeEnabled();

  await page.getByRole("button", { name: "Approve changes" }).click();
  await expect(page.getByTestId("source-code")).not.toContainText("#nip#");
  await expect(page.getByText("Schema valid")).toBeVisible();

  const status = await executeWebMcpTool<{
    revision: number;
    originalSha256: string;
    draftSha256: string;
    pendingProposal: unknown;
    validation: { valid: boolean };
  }>(page, "get_workspace_status", {});
  expect(status.revision).toBe(1);
  expect(status.pendingProposal).toBeNull();
  expect(status.validation.valid).toBe(true);
  expect(status.originalSha256).not.toBe(status.draftSha256);

  const accessibility = await new AxeBuilder({ page }).analyze();
  const serious = accessibility.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(serious).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test("ordinary browsers get an honest unsupported state and working human UI", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("WebMCP unavailable")).toBeVisible();
  await expect(page.locator(".asset-item")).toHaveCount(55);
  await page.getByRole("button", { name: "Manual demo fallback" }).click();
  await expect(
    page.getByRole("heading", { name: "Pending human approval" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve changes" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Validate proposed change" }).click();
  await expect(page.getByText("Schema valid before approval")).toBeVisible();
  await page.getByRole("button", { name: "Reject proposal" }).click();
  await expect(page.getByText("No pending change")).toBeVisible();
  await expect(page.getByTestId("source-code")).toContainText("#nip#");

  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page
    .getByRole("searchbox", { name: "Search official assets" })
    .fill("CIRFMF API structures v10 source");
  await expect(page.locator(".asset-item")).toHaveCount(1);
  await page
    .getByRole("button", { name: /CIRFMF API structures v10 source/iu })
    .click();
  await expect(
    page.getByRole("heading", { name: "CIRFMF API structures v10 source" }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("judge-critical evidence stays legible and actionable on desktop and mobile", async ({
  page,
}) => {
  await installWebMcpHarness(page);
  await page.goto("/");
  await expect(page.getByText("6 WebMCP tools live")).toBeVisible();
  await expect(page.getByTestId("source-code")).toContainText("#nip#");

  const staged = await executeWebMcpTool<{ proposalId: string }>(
    page,
    "stage_exact_replacements",
    {
      summary: "Replace both official CIRFMF template placeholders",
      replacements: [
        {
          search: "#nip#",
          replacement: "1111111111",
          reason: "Schema-compatible demonstration NIP",
        },
        {
          search: "#invoice_number#",
          replacement: "FV/2026/001",
          reason: "Deterministic demonstration invoice number",
        },
      ],
    },
  );
  await executeWebMcpTool(page, "validate_workspace", {
    target: "pending-proposal",
  });
  await expect(page.getByText("Schema valid before approval")).toBeVisible();
  expect(staged.proposalId).toBeTruthy();

  const desktop = await page.evaluate(() => {
    const fontSize = (selector: string) =>
      Number.parseFloat(
        getComputedStyle(document.querySelector(selector) as Element).fontSize,
      );
    const list = document.querySelector(".asset-list") as HTMLElement;
    const listBox = list.getBoundingClientRect();
    const firstVisible = [...document.querySelectorAll(".asset-item")].find(
      (element) => {
        const box = element.getBoundingClientRect();
        return box.bottom > listBox.top && box.top < listBox.bottom;
      },
    );
    return {
      agentReady: fontSize(".agent-ready-copy"),
      collaborationStep: fontSize(".collaboration-steps strong"),
      toolChip: fontSize(".tool-chips code"),
      validationBody: fontSize(".validation-summary p"),
      proofBody: fontSize(".proposal-proof span"),
      resultPill: fontSize(".result-pill"),
      sourcePath: fontSize(".source-path"),
      revision: fontSize(".revision-pill"),
      codeToolbar: fontSize(".code-toolbar"),
      sourceCode: fontSize(".source-code"),
      proposalMeta: fontSize(".proposal-meta"),
      replacementReason: fontSize(".replacement-card p"),
      replacementCode: fontSize(".replacement-card code"),
      proposalDiff: fontSize(".proposal-diff"),
      approvalWarning: fontSize(".approval-warning"),
      historyTitle: fontSize(".history-list strong"),
      historySummary: fontSize(".history-list p"),
      historyTime: fontSize(".history-list time"),
      provenanceTerm: fontSize(".provenance-list dt"),
      provenanceValue: fontSize(".provenance-list dd"),
      monoValue: fontSize(".mono-value"),
      firstVisibleTop:
        firstVisible?.getBoundingClientRect().top ?? Number.NEGATIVE_INFINITY,
      listTop: listBox.top,
    };
  });
  expect(desktop.agentReady).toBeGreaterThanOrEqual(10);
  expect(desktop.collaborationStep).toBeGreaterThanOrEqual(10);
  expect(desktop.toolChip).toBeGreaterThanOrEqual(10);
  expect(desktop.validationBody).toBeGreaterThanOrEqual(11);
  expect(desktop.proofBody).toBeGreaterThanOrEqual(10);
  expect(desktop.resultPill).toBeGreaterThanOrEqual(10);
  expect(desktop.sourcePath).toBeGreaterThanOrEqual(10);
  expect(desktop.revision).toBeGreaterThanOrEqual(10);
  expect(desktop.codeToolbar).toBeGreaterThanOrEqual(10);
  expect(desktop.sourceCode).toBeGreaterThanOrEqual(12);
  expect(desktop.proposalMeta).toBeGreaterThanOrEqual(9.5);
  expect(desktop.replacementReason).toBeGreaterThanOrEqual(10);
  expect(desktop.replacementCode).toBeGreaterThanOrEqual(10);
  expect(desktop.proposalDiff).toBeGreaterThanOrEqual(10);
  expect(desktop.approvalWarning).toBeGreaterThanOrEqual(10);
  expect(desktop.historyTitle).toBeGreaterThanOrEqual(10);
  expect(desktop.historySummary).toBeGreaterThanOrEqual(10);
  expect(desktop.historyTime).toBeGreaterThanOrEqual(9);
  expect(desktop.provenanceTerm).toBeGreaterThanOrEqual(9.5);
  expect(desktop.provenanceValue).toBeGreaterThanOrEqual(10);
  expect(desktop.monoValue).toBeGreaterThanOrEqual(9.5);
  expect(desktop.firstVisibleTop).toBeGreaterThanOrEqual(desktop.listTop - 0.5);

  await page.keyboard.press("/");
  await expect(
    page.getByRole("searchbox", { name: "Search official assets" }),
  ).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const rect = (selector: string) =>
      (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
    const stepLabels = [
      ...document.querySelectorAll(".collaboration-steps strong"),
    ].map((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    const targetSelectors = [
      ".search-field",
      ".filter-tab",
      ".copy-prompt",
      ".button--preflight",
      ".button--approve",
      ".button--danger-ghost",
    ];
    return {
      stepLabels,
      targetHeights: targetSelectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)].map(
          (element) => element.getBoundingClientRect().height,
        ),
      ),
      assetHeight: rect(".asset-library").height,
      assetTop: rect(".asset-library").top,
      reviewTop: rect(".right-rail").top,
      sourceTop: rect(".source-panel").top,
      horizontalOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    };
  });
  expect(
    mobile.stepLabels.every((label) => label.scrollWidth <= label.clientWidth),
  ).toBe(true);
  expect(mobile.targetHeights.length).toBeGreaterThan(0);
  expect(Math.min(...mobile.targetHeights)).toBeGreaterThanOrEqual(44);
  expect(mobile.assetHeight).toBeLessThanOrEqual(380);
  expect(mobile.reviewTop).toBeGreaterThan(mobile.assetTop);
  expect(mobile.reviewTop).toBeLessThan(mobile.sourceTop);
  expect(mobile.horizontalOverflow).toBe(false);

  const accessibility = await new AxeBuilder({ page }).analyze();
  const serious = accessibility.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("keeps the default selected asset fully visible inside the mobile corpus list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installWebMcpHarness(page);
  await page.goto("/");
  await expect(page.getByText("6 WebMCP tools live")).toBeVisible();

  const geometry = await page.evaluate(() => {
    const list = document.querySelector(".asset-list") as HTMLElement;
    const selected = document.querySelector(
      ".asset-item.is-selected",
    ) as HTMLElement;
    const listBox = list.getBoundingClientRect();
    const selectedBox = selected.getBoundingClientRect();
    return {
      listTop: listBox.top,
      listBottom: listBox.bottom,
      selectedTop: selectedBox.top,
      selectedBottom: selectedBox.bottom,
    };
  });

  expect(geometry.selectedTop).toBeGreaterThanOrEqual(geometry.listTop - 0.5);
  expect(geometry.selectedBottom).toBeLessThanOrEqual(
    geometry.listBottom + 0.5,
  );
});
