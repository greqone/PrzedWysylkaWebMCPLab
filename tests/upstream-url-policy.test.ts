import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const script = resolve(root, "scripts/verify-upstream-sources.py");
const python = process.platform === "win32" ? "python" : "python3";

function runScript(...args: string[]) {
  return spawnSync(python, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function checkPinnedHandlerCompatibility() {
  const probe = [
    "import importlib.util, sys, urllib.request",
    "sys.dont_write_bytecode = True",
    "spec = importlib.util.spec_from_file_location('upstream_verifier', sys.argv[1])",
    "module = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "handler = module.PinnedHTTPSHandler()",
    "if hasattr(handler, '_check_hostname'): delattr(handler, '_check_hostname')",
    "captured = {}",
    "def fake_do_open(connection_class, request, **kwargs):",
    "    captured.update(connection_class=connection_class, request=request, kwargs=kwargs)",
    "    return 'opened'",
    "handler.do_open = fake_do_open",
    "request = urllib.request.Request('https://example.com/')",
    "assert handler.https_open(request) == 'opened'",
    "assert captured['connection_class'] is module.PinnedHTTPSConnection",
    "assert captured['request'] is request",
    "assert captured['kwargs'] == {'context': handler._context}",
  ].join("\n");
  return spawnSync(python, ["-c", probe, script], {
    cwd: root,
    encoding: "utf8",
  });
}

function checkUrl(url: string) {
  return runScript("--check-url", url);
}

function checkRedirect(target: string) {
  return runScript(
    "--check-redirect",
    "https://ksef.podatki.gov.pl/media/e5cia0ey/przykladowe-pliki-dla-struktury-logicznej-e-faktury-fa-3.zip",
    target,
  );
}

function checkAddresses(hostname: string, addresses: string[]) {
  return runScript("--check-addresses", hostname, ...addresses);
}

describe("upstream verifier URL policy", () => {
  test.each([
    "https://ksef.podatki.gov.pl/media/e5cia0ey/przykladowe-pliki-dla-struktury-logicznej-e-faktury-fa-3.zip",
    "https://crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd",
    "https://raw.githubusercontent.com/CIRFMF/ksef-client-csharp/04f01c1c7834336a3aef1804149cd5bcbd883a3e/KSeF.Client.Tests.Core/Templates/invoice-template-fa-3.xml",
    "https://codeload.github.com/CIRFMF/ksef-client-csharp/zip/04f01c1c7834336a3aef1804149cd5bcbd883a3e",
  ])("allows frozen first-party URL %s", (url) => {
    const result = checkUrl(url);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("allowed upstream URL");
  });

  test.each([
    "http://127.0.0.1:8080/private",
    "https://192.168.0.1/admin",
    "https://user:password@crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd",
    "http://crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd",
    "https://raw.githubusercontent.com/CIRFMF/ksef-api/main/faktury/schemy/FA/schemat_FA(3)_v1-0E.xsd",
    "https://codeload.github.com/CIRFMF/ksef-api/zip/main",
    "https://codeload.github.com/CIRFMF/ksef-api/zip/0000000000000000000000000000000000000000",
    "https://evil.example/asset.xml",
  ])("rejects non-frozen or unsafe URL %s", (url) => {
    const result = checkUrl(url);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("rejected upstream URL");
  });

  test("allows only an exact frozen target before following a redirect", () => {
    const allowed = checkRedirect(
      "https://crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd",
    );
    expect(allowed.status, allowed.stderr).toBe(0);
    expect(allowed.stdout).toContain("allowed upstream redirect");

    const rejected = checkRedirect("https://192.168.0.1/admin");
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("rejected upstream redirect");
  });

  test("bounds HTTP bodies, ZIP members, and slow streams", () => {
    const result = runScript("--self-test-limits");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "missing-content-length, misleading-content-length, oversized-stream, oversized-zip-member, slow-stream",
    );
  });

  test("accepts only globally routable resolved addresses", () => {
    const allowed = checkAddresses("raw.githubusercontent.com", [
      "93.184.216.34",
      "2606:4700::6810:85e5",
    ]);
    expect(allowed.status, allowed.stderr).toBe(0);
    expect(allowed.stdout).toContain("allowed resolved addresses");
  });

  test.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.1.1",
    "192.168.0.1",
    "224.0.0.1",
    "0.0.0.0",
    "192.0.2.1",
    "::1",
    "fc00::1",
    "fe80::1",
  ])(
    "rejects allowlisted hostname resolving to non-public IP %s",
    (address) => {
      const result = checkAddresses("raw.githubusercontent.com", [address]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("rejected resolved addresses");
    },
  );

  test("pins the TCP connection to a validated address and rechecks its peer", () => {
    const result = runScript("--self-test-pinned-connection");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "pinned-destination, private-resolution, private-peer",
    );
  });

  test("does not depend on Python-version-private HTTPS handler state", () => {
    const result = checkPinnedHandlerCompatibility();
    expect(result.status, result.stderr).toBe(0);
  });
});
