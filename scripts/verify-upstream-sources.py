#!/usr/bin/env python3
"""Replay the frozen FA(3) corpus from its first-party source URLs."""

from __future__ import annotations

import argparse
import hashlib
import http.client
import io
import ipaddress
import json
import pathlib
import re
import socket
import time
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "data" / "official-assets.lock.json"
SCOPE_PATH = ROOT / "data" / "official-source-scope.json"
DEFAULT_REPORT = ROOT / "docs" / "assets" / "upstream-verification.json"
USER_AGENT = "PrzedWysylkaWebMCPLab-UpstreamVerifier/1.0"
MAX_HTTP_RESOURCE_BYTES = 16 * 1024 * 1024
MAX_ZIP_MEMBER_BYTES = 4 * 1024 * 1024
READ_CHUNK_BYTES = 64 * 1024
READ_LOOP_BUDGET_SECONDS = 90
SOCKET_TIMEOUT_SECONDS = 30
TRANSFER_DEADLINE_SECONDS = READ_LOOP_BUDGET_SECONDS + SOCKET_TIMEOUT_SECONDS
RAW_GITHUB = re.compile(
    r"^https://raw\.githubusercontent\.com/CIRFMF/([^/]+)/([a-f0-9]{40})/"
)
CODELOAD_GITHUB = re.compile(
    r"^https://codeload\.github\.com/CIRFMF/([^/]+)/zip/([a-f0-9]{40})$"
)
_ARCHIVE_CACHE: dict[str, bytes] = {}
DETERMINISTIC_ARCHIVE_REPLAY_URLS = frozenset(
    {
        "https://raw.githubusercontent.com/CIRFMF/ksef-client-csharp/"
        "04f01c1c7834336a3aef1804149cd5bcbd883a3e/"
        "KSeF.Client.Tests.PdfTestApp/Externals/ksef-pdf-generator/"
        "assets/invoice.xml"
    }
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_url_policy(
    manifest: dict[str, object], scope: dict[str, object]
) -> tuple[set[str], dict[str, str]]:
    assets = manifest["assets"]
    allowed_urls = {str(record["sourceUrl"]) for record in assets}
    allowed_urls.add(str(scope["ministryArchive"]["downloadUrl"]))
    allowed_urls.update(
        str(record["sourceUrl"])
        for record in scope.get("cirfmfLicenseResources", [])
    )
    allowed_urls.update(
        str(record["archive"]["sourceUrl"])
        for record in scope.get("cirfmfRepositories", [])
    )
    pins = {
        str(record["name"]): str(record["commit"])
        for record in scope["cirfmfRepositories"]
    }
    return allowed_urls, pins


def validate_source_url(
    url: str, allowed_urls: set[str], pins: dict[str, str]
) -> None:
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as error:
        raise ValueError(f"malformed URL: {error}") from error
    if parsed.scheme != "https":
        raise ValueError("HTTPS is required")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("embedded credentials are forbidden")
    if port is not None:
        raise ValueError("explicit ports are forbidden")
    if parsed.query or parsed.fragment:
        raise ValueError("queries and fragments are forbidden")
    if url not in allowed_urls:
        raise ValueError("URL is not an exact frozen manifest source")
    if parsed.hostname not in {
        "ksef.podatki.gov.pl",
        "crd.gov.pl",
        "codeload.github.com",
        "raw.githubusercontent.com",
    }:
        raise ValueError("host is not first-party allowlisted")
    match = RAW_GITHUB.match(url)
    if parsed.hostname == "raw.githubusercontent.com":
        if not match:
            raise ValueError("raw GitHub URL lacks a pinned CIRFMF commit")
        repository, commit = match.groups()
        if pins.get(repository) != commit:
            raise ValueError("raw GitHub commit does not match the scope ledger")
    if parsed.hostname == "codeload.github.com":
        archive_match = CODELOAD_GITHUB.match(url)
        if not archive_match:
            raise ValueError("codeload URL lacks a pinned CIRFMF commit")
        repository, commit = archive_match.groups()
        if pins.get(repository) != commit:
            raise ValueError("codeload commit does not match the scope ledger")


def validate_resolved_addresses(
    hostname: str, addresses: list[str] | tuple[str, ...]
) -> tuple[str, ...]:
    if not addresses:
        raise ValueError(f"{hostname}: DNS resolution returned no addresses")
    validated: list[str] = []
    for raw_address in addresses:
        address = raw_address.split("%", 1)[0]
        try:
            parsed = ipaddress.ip_address(address)
        except ValueError as error:
            raise ValueError(f"{hostname}: malformed resolved IP {raw_address}") from error
        if (
            not parsed.is_global
            or parsed.is_multicast
            or parsed.is_reserved
            or parsed.is_unspecified
            or parsed.is_loopback
            or parsed.is_link_local
            or parsed.is_private
        ):
            raise ValueError(
                f"{hostname}: resolved non-public destination {raw_address}"
            )
        validated.append(address)
    return tuple(sorted(set(validated)))


def resolve_public_addresses(hostname: str, port: int) -> tuple[str, ...]:
    records = socket.getaddrinfo(
        hostname,
        port,
        family=socket.AF_UNSPEC,
        type=socket.SOCK_STREAM,
    )
    addresses = [str(record[4][0]) for record in records]
    return validate_resolved_addresses(hostname, addresses)


def open_pinned_socket(
    hostname: str,
    port: int,
    timeout: float,
    source_address: tuple[str, int] | None = None,
    *,
    resolver: object | None = None,
    connector: object | None = None,
) -> object:
    resolver = resolver or resolve_public_addresses
    connector = connector or socket.create_connection
    errors: list[OSError] = []
    for address in resolver(hostname, port):
        raw_socket = None
        try:
            raw_socket = connector((address, port), timeout, source_address)
            peer = str(raw_socket.getpeername()[0])
            validate_resolved_addresses(hostname, [peer])
            return raw_socket
        except ValueError:
            if raw_socket is not None:
                raw_socket.close()
            raise
        except OSError as error:
            if raw_socket is not None:
                raw_socket.close()
            errors.append(error)
    detail = errors[-1] if errors else "no public address was connectable"
    raise OSError(f"{hostname}: pinned connection failed: {detail}")


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def connect(self) -> None:
        if self._tunnel_host is not None:
            raise OSError("HTTPS proxy tunnels are disabled")
        raw_socket = open_pinned_socket(
            self.host,
            self.port,
            self.timeout,
            self.source_address,
        )
        try:
            self.sock = self._context.wrap_socket(
                raw_socket,
                server_hostname=self.host,
            )
            validate_resolved_addresses(
                self.host,
                [str(self.sock.getpeername()[0])],
            )
        except Exception:
            raw_socket.close()
            raise


class PinnedHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, request: urllib.request.Request) -> object:
        return self.do_open(
            PinnedHTTPSConnection,
            request,
            context=self._context,
            check_hostname=self._check_hostname,
        )


class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed_urls: set[str], pins: dict[str, str]) -> None:
        super().__init__()
        self.allowed_urls = allowed_urls
        self.pins = pins

    def redirect_request(
        self,
        request: urllib.request.Request,
        file_pointer: object,
        code: int,
        message: str,
        headers: object,
        new_url: str,
    ) -> urllib.request.Request | None:
        validate_source_url(new_url, self.allowed_urls, self.pins)
        return super().redirect_request(
            request, file_pointer, code, message, headers, new_url
        )


def read_bounded_stream(
    stream: object,
    expected_bytes: int,
    maximum_bytes: int,
    label: str,
    *,
    deadline_seconds: float = TRANSFER_DEADLINE_SECONDS,
    clock: object = time.monotonic,
) -> bytes:
    if expected_bytes < 0:
        raise ValueError(f"{label}: negative expected byte count")
    if expected_bytes > maximum_bytes:
        raise ValueError(
            f"{label}: expected {expected_bytes} bytes exceeds the {maximum_bytes}-byte limit"
        )
    started = clock()
    body = bytearray()
    while True:
        if clock() - started > deadline_seconds:
            raise TimeoutError(
                f"{label}: transfer exceeded {deadline_seconds:g} seconds"
            )
        remaining_with_overflow_probe = expected_bytes + 1 - len(body)
        chunk = stream.read(min(READ_CHUNK_BYTES, remaining_with_overflow_probe))
        if not chunk:
            break
        if not isinstance(chunk, bytes):
            raise TypeError(f"{label}: stream returned non-byte content")
        body.extend(chunk)
        if len(body) > expected_bytes:
            raise ValueError(
                f"{label}: response exceeded declared {expected_bytes} bytes"
            )
    if len(body) != expected_bytes:
        raise ValueError(
            f"{label}: expected {expected_bytes} bytes, received {len(body)}"
        )
    return bytes(body)


def read_http_response(
    response: object,
    expected_bytes: int,
    label: str,
    *,
    deadline_seconds: float = TRANSFER_DEADLINE_SECONDS,
    clock: object = time.monotonic,
) -> bytes:
    content_length = response.headers.get("Content-Length")
    if content_length is not None:
        try:
            declared_bytes = int(content_length)
        except (TypeError, ValueError) as error:
            raise ValueError(f"{label}: invalid Content-Length") from error
        if declared_bytes != expected_bytes:
            raise ValueError(
                f"{label}: Content-Length {declared_bytes} does not match expected {expected_bytes}"
            )
    return read_bounded_stream(
        response,
        expected_bytes,
        MAX_HTTP_RESOURCE_BYTES,
        label,
        deadline_seconds=deadline_seconds,
        clock=clock,
    )


def read_zip_member(
    archive: zipfile.ZipFile,
    member_name: str,
    expected_bytes: int,
    label: str,
) -> bytes:
    if expected_bytes > MAX_ZIP_MEMBER_BYTES:
        raise ValueError(
            f"{label}: expected ZIP member size exceeds {MAX_ZIP_MEMBER_BYTES} bytes"
        )
    info = archive.getinfo(member_name)
    if info.is_dir():
        raise ValueError(f"{label}: ZIP member is a directory")
    if info.file_size != expected_bytes:
        raise ValueError(
            f"{label}: ZIP member declares {info.file_size} bytes, expected {expected_bytes}"
        )
    with archive.open(info, "r") as member:
        return read_bounded_stream(
            member,
            expected_bytes,
            MAX_ZIP_MEMBER_BYTES,
            label,
        )


def archive_member_path(repository: str, commit: str, source_path: str) -> str:
    """Map a raw GitHub source path to its pinned codeload archive member."""
    return f"{repository}-{commit}/{source_path}"


def fetch(
    url: str,
    expected_bytes: int,
    allowed_urls: set[str],
    pins: dict[str, str],
    attempts: int = 3,
) -> bytes:
    validate_source_url(url, allowed_urls, pins)
    if expected_bytes > MAX_HTTP_RESOURCE_BYTES:
        raise ValueError(
            f"{url}: expected size exceeds {MAX_HTTP_RESOURCE_BYTES} bytes"
        )
    last_error: Exception | None = None
    started = time.monotonic()
    for attempt in range(attempts):
        remaining_seconds = READ_LOOP_BUDGET_SECONDS - (
            time.monotonic() - started
        )
        if remaining_seconds <= 0:
            break
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({}),
                SafeRedirectHandler(allowed_urls, pins),
                PinnedHTTPSHandler(),
            )
            with opener.open(
                request,
                timeout=min(SOCKET_TIMEOUT_SECONDS, remaining_seconds),
            ) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                validate_source_url(response.geturl(), allowed_urls, pins)
                remaining_seconds = READ_LOOP_BUDGET_SECONDS - (
                    time.monotonic() - started
                )
                if remaining_seconds <= 0:
                    raise TimeoutError(
                        f"{url}: exhausted the shared read-loop budget"
                    )
                return read_http_response(
                    response,
                    expected_bytes,
                    url,
                    deadline_seconds=remaining_seconds,
                )
        except Exception as error:  # pragma: no cover - network-specific exception tree
            last_error = error
            if attempt + 1 < attempts:
                remaining_seconds = READ_LOOP_BUDGET_SECONDS - (
                    time.monotonic() - started
                )
                if remaining_seconds <= 0:
                    break
                time.sleep(min(1.5 * (attempt + 1), remaining_seconds))
    raise RuntimeError(f"failed to fetch {url}: {last_error}")


def fetch_raw_from_pinned_archive(
    url: str,
    expected_bytes: int,
    allowed_urls: set[str],
    pins: dict[str, str],
    archive_url: str,
    archive_expected_bytes: int,
    archive_sha256: str,
    source_path: str,
    replay_used: list[str] | None = None,
) -> bytes:
    """Replay one declared raw resource from its pinned codeload member.

    This route is deterministic for known submodule-embedded paths. Normal raw
    resources never enter this function and fail closed if their exact URL is
    unavailable.
    """
    archive = _ARCHIVE_CACHE.get(archive_url)
    if archive is None:
        archive = fetch(
            archive_url,
            archive_expected_bytes,
            allowed_urls,
            pins,
        )
        if len(archive) != archive_expected_bytes:
            raise RuntimeError(
                f"{url}: replay archive expected {archive_expected_bytes} "
                f"bytes, received {len(archive)}"
            )
        if sha256(archive) != archive_sha256:
            raise RuntimeError(f"{url}: replay archive SHA-256 mismatch")
        _ARCHIVE_CACHE[archive_url] = archive
    raw_match = RAW_GITHUB.match(url)
    if raw_match is None:
        raise RuntimeError(f"{url}: deterministic archive replay requires raw GitHub")
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        member_name = archive_member_path(
            raw_match.group(1),
            raw_match.group(2),
            source_path,
        )
        try:
            data = read_zip_member(
                zipped,
                member_name,
                expected_bytes,
                url,
            )
        except KeyError as error:
            raise RuntimeError(
                f"{url}: replay archive lacks member {member_name}"
            ) from error
    if replay_used is not None:
        replay_used.append(url)
    return data


def assert_resource_bytes(
    label: str,
    expected_bytes: int,
    expected_sha: str,
    data: bytes,
    errors: list[str],
) -> None:
    if len(data) != expected_bytes:
        errors.append(
            f"{label}: expected {expected_bytes} upstream bytes, received {len(data)}"
        )
    actual_sha = sha256(data)
    if actual_sha != expected_sha:
        errors.append(
            f"{label}: expected upstream SHA-256 {expected_sha}, received {actual_sha}"
        )


def assert_bytes(record: dict[str, object], data: bytes, errors: list[str]) -> None:
    assert_resource_bytes(
        str(record["id"]),
        int(record["bytes"]),
        str(record["sha256"]),
        data,
        errors,
    )


def verify(report_path: pathlib.Path | None) -> dict[str, object]:
    manifest_bytes = MANIFEST_PATH.read_bytes()
    scope_bytes = SCOPE_PATH.read_bytes()
    manifest = json.loads(manifest_bytes)
    scope = json.loads(scope_bytes)
    allowed_urls, pins = build_url_policy(manifest, scope)
    assets = manifest["assets"]
    mf_source = manifest["sources"]["mfExamplesArchive"]
    archive_url = mf_source["downloadUrl"]
    mf_assets = [record for record in assets if record["sourceUrl"] == archive_url]
    direct_assets = [record for record in assets if record["sourceUrl"] != archive_url]
    license_resources = scope["cirfmfLicenseResources"]
    errors: list[str] = []

    archive = fetch(
        archive_url,
        int(mf_source["bytes"]),
        allowed_urls,
        pins,
    )
    if len(archive) != int(mf_source["bytes"]):
        errors.append(
            f"MF archive: expected {mf_source['bytes']} bytes, received {len(archive)}"
        )
    archive_sha = sha256(archive)
    if archive_sha != mf_source["sha256"]:
        errors.append(
            f"MF archive: expected SHA-256 {mf_source['sha256']}, received {archive_sha}"
        )
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        expected_members = sorted(record["sourcePath"] for record in mf_assets)
        actual_members = sorted(
            name for name in zipped.namelist() if name.lower().endswith(".xml")
        )
        if actual_members != expected_members:
            errors.append(
                "MF archive XML member inventory mismatch: "
                f"expected {expected_members}, received {actual_members}"
            )
        for record in mf_assets:
            try:
                data = read_zip_member(
                    zipped,
                    str(record["sourcePath"]),
                    int(record["bytes"]),
                    str(record["id"]),
                )
            except (KeyError, ValueError, TimeoutError) as error:
                errors.append(f"{record['id']}: archive member is missing")
                if not isinstance(error, KeyError):
                    errors[-1] = str(error)
                continue
            assert_bytes(record, data, errors)

    corpus_urls = sorted({str(record["sourceUrl"]) for record in direct_assets})
    license_urls = sorted(
        {str(record["sourceUrl"]) for record in license_resources}
    )
    expected_sizes: dict[str, int] = {}
    for record in [*direct_assets, *license_resources]:
        url = str(record["sourceUrl"])
        expected = int(record["bytes"])
        previous = expected_sizes.setdefault(url, expected)
        if previous != expected:
            errors.append(
                f"{url}: conflicting expected byte counts {previous} and {expected}"
            )
    urls = sorted(expected_sizes)
    fetched: dict[str, bytes] = {}
    archive_replay_used: list[str] = []
    missing_archive_replays = DETERMINISTIC_ARCHIVE_REPLAY_URLS.difference(urls)
    if missing_archive_replays:
        errors.append(
            "deterministic archive replay URLs are absent from the frozen resources: "
            f"{sorted(missing_archive_replays)}"
        )
    archive_by_repo = {
        str(record["name"]): record["archive"]
        for record in scope["cirfmfRepositories"]
    }
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {}
        for url in urls:
            match = RAW_GITHUB.match(url)
            if match and url in DETERMINISTIC_ARCHIVE_REPLAY_URLS:
                repository = match.group(1)
                archive = archive_by_repo.get(repository)
                if archive is None:
                    errors.append(f"{url}: replay archive is missing from scope")
                    continue
                futures[
                    executor.submit(
                        fetch_raw_from_pinned_archive,
                        url,
                        expected_sizes[url],
                        allowed_urls,
                        pins,
                        str(archive["sourceUrl"]),
                        int(archive["bytes"]),
                        str(archive["sha256"]),
                        urlsplit(url).path.split("/", 4)[4],
                        archive_replay_used,
                    )
                ] = url
                continue
            futures[
                executor.submit(
                    fetch,
                    url,
                    expected_sizes[url],
                    allowed_urls,
                    pins,
                )
            ] = url
        for future in as_completed(futures):
            url = futures[future]
            try:
                fetched[url] = future.result()
            except Exception as error:
                errors.append(str(error))

    crd_records = 0
    cirfmf_records = 0
    for record in direct_assets:
        url = str(record["sourceUrl"])
        if "crd.gov.pl/" in url:
            crd_records += 1
        match = RAW_GITHUB.match(url)
        if match:
            cirfmf_records += 1
            if record.get("sourceRevision") != match.group(2):
                errors.append(
                    f"{record['id']}: sourceRevision does not match raw Git URL commit"
                )
        data = fetched.get(url)
        if data is not None:
            assert_bytes(record, data, errors)

    license_report: list[dict[str, object]] = []
    license_root = (ROOT / "public" / "third-party" / "cirfmf").resolve()
    for record in license_resources:
        url = str(record["sourceUrl"])
        repository = str(record["repository"])
        commit = str(record["commit"])
        match = RAW_GITHUB.match(url)
        if not match or match.groups() != (repository, commit):
            errors.append(
                f"{record['localPath']}: license URL does not match repository/commit"
            )
        if pins.get(repository) != commit:
            errors.append(
                f"{record['localPath']}: license commit does not match scope pin"
            )
        local_path = (ROOT / str(record["localPath"])).resolve()
        if not local_path.is_relative_to(license_root):
            errors.append(f"{record['localPath']}: license path escapes its root")
            continue
        try:
            with local_path.open("rb") as local_file:
                local_bytes = read_bounded_stream(
                    local_file,
                    int(record["bytes"]),
                    MAX_HTTP_RESOURCE_BYTES,
                    str(record["localPath"]),
                )
        except (OSError, ValueError, TimeoutError) as error:
            errors.append(str(error))
            continue
        assert_resource_bytes(
            str(record["localPath"]),
            int(record["bytes"]),
            str(record["sha256"]),
            local_bytes,
            errors,
        )
        upstream_bytes = fetched.get(url)
        if upstream_bytes is not None:
            assert_resource_bytes(
                f"{record['localPath']} upstream",
                int(record["bytes"]),
                str(record["sha256"]),
                upstream_bytes,
                errors,
            )
            if upstream_bytes != local_bytes:
                errors.append(
                    f"{record['localPath']}: local bytes differ from live upstream bytes"
                )
        license_report.append(
            {
                "sourceUrl": url,
                "localPath": str(record["localPath"]),
                "bytes": int(record["bytes"]),
                "sha256": str(record["sha256"]),
            }
        )

    source_classes = {
        "ministryArchiveMembers": len(mf_assets),
        "crdDirectRecords": crd_records,
        "cirfmfRawGitRecords": cirfmf_records,
    }
    expected_classes = {
        "ministryArchiveMembers": 26,
        "crdDirectRecords": 4,
        "cirfmfRawGitRecords": 25,
    }
    if source_classes != expected_classes:
        errors.append(
            f"source class mismatch: expected {expected_classes}, received {source_classes}"
        )
    if len(assets) != scope["totals"]["sourceRecords"]:
        errors.append(
            f"manifest/scope record mismatch: {len(assets)} vs {scope['totals']['sourceRecords']}"
        )
    if len(corpus_urls) + 1 != 30:
        errors.append(
            f"expected 30 corpus HTTP resources, received {len(corpus_urls) + 1}"
        )
    if len(license_urls) != 4:
        errors.append(
            f"expected 4 license HTTP resources, received {len(license_urls)}"
        )
    if len(urls) + 1 != 34:
        errors.append(f"expected 34 total HTTP resources, received {len(urls) + 1}")

    if errors:
        raise RuntimeError("Upstream source replay failed:\n- " + "\n- ".join(errors))

    report: dict[str, object] = {
        "schemaVersion": 1,
        "observedAt": scope["observedAt"],
        "manifestSha256": sha256(manifest_bytes),
        "sourceScopeSha256": sha256(scope_bytes),
        "allMatched": True,
        "verifiedSourceRecords": len(assets),
        "verifiedCorpusHttpResources": len(corpus_urls) + 1,
        "verifiedLicenseResources": len(license_resources),
        "verifiedLicenseHttpResources": len(license_urls),
        "verifiedHttpResources": len(urls) + 1,
        "sourceClasses": source_classes,
        "licenseResources": license_report,
        "limits": {
            "maxHttpResourceBytes": MAX_HTTP_RESOURCE_BYTES,
            "maxZipMemberBytes": MAX_ZIP_MEMBER_BYTES,
            "readChunkBytes": READ_CHUNK_BYTES,
            "readLoopBudgetSeconds": READ_LOOP_BUDGET_SECONDS,
            "socketTimeoutSeconds": SOCKET_TIMEOUT_SECONDS,
            "transferDeadlineSeconds": TRANSFER_DEADLINE_SECONDS,
        },
        "networkPolicy": {
            "globallyRoutableDnsOnly": True,
            "pinnedTcpDestination": True,
            "peerIpRevalidated": True,
            "proxiesDisabled": True,
        },
        "archiveReplayUsed": archive_replay_used,
        "ministryArchiveSha256": archive_sha,
    }
    if report_path is not None:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_bytes(
            (json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode(
                "utf-8"
            )
        )
    return report


def run_limit_self_test() -> list[str]:
    class FakeResponse(io.BytesIO):
        def __init__(self, body: bytes, content_length: str | None = None) -> None:
            super().__init__(body)
            self.headers = {}
            if content_length is not None:
                self.headers["Content-Length"] = content_length

    class SlowStream:
        def read(self, _: int) -> bytes:
            return b"x"

    class FakeClock:
        def __init__(self, values: list[float]) -> None:
            self.values = iter(values)
            self.last = values[-1]

        def __call__(self) -> float:
            self.last = next(self.values, self.last)
            return self.last

    def expect_rejected(callback: object) -> None:
        try:
            callback()
        except (TypeError, ValueError, TimeoutError):
            return
        raise AssertionError("bounded reader accepted a hostile fixture")

    passed: list[str] = []
    body = read_http_response(FakeResponse(b"test"), 4, "missing length")
    if body != b"test":
        raise AssertionError("missing Content-Length changed exact bytes")
    passed.append("missing-content-length")

    expect_rejected(
        lambda: read_http_response(
            FakeResponse(b"test", content_length="5"),
            4,
            "misleading length",
        )
    )
    passed.append("misleading-content-length")

    expect_rejected(
        lambda: read_http_response(FakeResponse(b"tests"), 4, "oversized stream")
    )
    expect_rejected(
        lambda: read_bounded_stream(
            io.BytesIO(),
            MAX_HTTP_RESOURCE_BYTES + 1,
            MAX_HTTP_RESOURCE_BYTES,
            "oversized expectation",
        )
    )
    passed.append("oversized-stream")

    zip_bytes = io.BytesIO()
    with zipfile.ZipFile(zip_bytes, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("oversized.xml", b"tests")
    with zipfile.ZipFile(io.BytesIO(zip_bytes.getvalue())) as archive:
        expect_rejected(
            lambda: read_zip_member(archive, "oversized.xml", 4, "oversized ZIP")
        )
    passed.append("oversized-zip-member")

    expect_rejected(
        lambda: read_bounded_stream(
            SlowStream(),
            2,
            MAX_HTTP_RESOURCE_BYTES,
            "slow stream",
            clock=FakeClock([0.0, 0.0, TRANSFER_DEADLINE_SECONDS + 1.0]),
        )
    )
    passed.append("slow-stream")
    return passed


def run_pinned_connection_self_test() -> list[str]:
    class FakeSocket:
        def __init__(self, peer: str) -> None:
            self.peer = peer
            self.closed = False

        def getpeername(self) -> tuple[str, int]:
            return self.peer, 443

        def close(self) -> None:
            self.closed = True

    destinations: list[tuple[str, int]] = []

    def public_resolver(_: str, __: int) -> tuple[str, ...]:
        return ("93.184.216.34",)

    def public_connector(
        destination: tuple[str, int],
        _: float,
        __: tuple[str, int] | None,
    ) -> FakeSocket:
        destinations.append(destination)
        return FakeSocket("93.184.216.34")

    pinned = open_pinned_socket(
        "raw.githubusercontent.com",
        443,
        1,
        resolver=public_resolver,
        connector=public_connector,
    )
    if destinations != [("93.184.216.34", 443)]:
        raise AssertionError("connector received a hostname instead of a pinned IP")
    pinned.close()
    passed = ["pinned-destination"]

    try:
        open_pinned_socket(
            "raw.githubusercontent.com",
            443,
            1,
            resolver=lambda host, _: validate_resolved_addresses(
                host, ["127.0.0.1"]
            ),
            connector=public_connector,
        )
    except ValueError:
        passed.append("private-resolution")
    else:
        raise AssertionError("private DNS result was accepted")

    private_peer = FakeSocket("127.0.0.1")

    def private_peer_connector(
        _: tuple[str, int],
        __: float,
        ___: tuple[str, int] | None,
    ) -> FakeSocket:
        return private_peer

    try:
        open_pinned_socket(
            "raw.githubusercontent.com",
            443,
            1,
            resolver=public_resolver,
            connector=private_peer_connector,
        )
    except ValueError:
        if not private_peer.closed:
            raise AssertionError("private peer socket was not closed")
        passed.append("private-peer")
    else:
        raise AssertionError("private connected peer was accepted")
    return passed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--write-report",
        action="store_true",
        help="write docs/assets/upstream-verification.json after a complete pass",
    )
    parser.add_argument(
        "--check-url",
        help="validate one URL against the frozen manifest policy without fetching it",
    )
    parser.add_argument(
        "--check-redirect",
        nargs=2,
        metavar=("SOURCE", "TARGET"),
        help="exercise the pre-follow redirect policy without network access",
    )
    parser.add_argument(
        "--self-test-limits",
        action="store_true",
        help="exercise bounded HTTP and ZIP readers without network access",
    )
    parser.add_argument(
        "--check-addresses",
        nargs="+",
        metavar="VALUE",
        help="validate supplied resolved IPs for one hostname without DNS",
    )
    parser.add_argument(
        "--self-test-pinned-connection",
        action="store_true",
        help="exercise DNS pinning and peer-IP checks without network access",
    )
    arguments = parser.parse_args()
    if arguments.self_test_pinned_connection:
        print(
            "pinned connection self-test: "
            + ", ".join(run_pinned_connection_self_test())
        )
        return
    if arguments.check_addresses is not None:
        if len(arguments.check_addresses) < 2:
            parser.exit(2, "--check-addresses requires HOST and at least one IP\n")
        hostname, *addresses = arguments.check_addresses
        try:
            validate_resolved_addresses(hostname, addresses)
        except ValueError as error:
            parser.exit(1, f"rejected resolved addresses: {error}\n")
        print(f"allowed resolved addresses for {hostname}: {', '.join(addresses)}")
        return
    if arguments.self_test_limits:
        print("bounded reader self-test: " + ", ".join(run_limit_self_test()))
        return
    if arguments.check_redirect is not None:
        manifest = json.loads(MANIFEST_PATH.read_bytes())
        scope = json.loads(SCOPE_PATH.read_bytes())
        allowed_urls, pins = build_url_policy(manifest, scope)
        source, target = arguments.check_redirect
        handler = SafeRedirectHandler(allowed_urls, pins)
        try:
            handler.redirect_request(
                urllib.request.Request(source),
                None,
                302,
                "Found",
                {},
                target,
            )
        except ValueError as error:
            parser.exit(1, f"rejected upstream redirect: {error}\n")
        print(f"allowed upstream redirect: {source} -> {target}")
        return
    if arguments.check_url is not None:
        manifest = json.loads(MANIFEST_PATH.read_bytes())
        scope = json.loads(SCOPE_PATH.read_bytes())
        allowed_urls, pins = build_url_policy(manifest, scope)
        try:
            validate_source_url(arguments.check_url, allowed_urls, pins)
        except ValueError as error:
            parser.exit(1, f"rejected upstream URL: {error}\n")
        print(f"allowed upstream URL: {arguments.check_url}")
        return
    report = verify(DEFAULT_REPORT if arguments.write_report else None)
    print(
        "Upstream source replay verified: "
        f"{report['verifiedSourceRecords']} corpus source records plus "
        f"{report['verifiedLicenseResources']} license resources across "
        f"{report['verifiedHttpResources']} HTTP resources."
    )


if __name__ == "__main__":
    main()
