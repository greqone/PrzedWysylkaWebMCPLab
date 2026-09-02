import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { executeWebMcpTool, installWebMcpHarness } from "./webmcp-harness";

test("WebMCP harness stages a repair and only the human approves it", async ({
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
