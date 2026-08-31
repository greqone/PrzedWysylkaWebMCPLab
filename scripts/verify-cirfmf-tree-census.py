#!/usr/bin/env python3
"""Independently census the six frozen CIRFMF default-branch trees."""

from __future__ import annotations

import argparse
import copy
import fnmatch
import hashlib
import importlib.util
import io
import json
import pathlib
import re
import struct
import sys
import warnings
import urllib.request
import zipfile
from xml.parsers import expat

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "data" / "official-assets.lock.json"
SCOPE_PATH = ROOT / "data" / "official-source-scope.json"
DEFAULT_REPORT = ROOT / "docs" / "assets" / "cirfmf-tree-census.json"
EXPECTED_REPOSITORIES = (
    "ksef-api",
    "ksef-client-csharp",
    "ksef-client-java",
    "ksef-latarnia",
    "ksef-pdf-generator",
    "ksef-schematy",
)
MAX_ARCHIVE_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 10_000
FA3_XML_NAMESPACE = "http://crd.gov.pl/wzor/2025/06/25/13775/"
FA3_XML_ROOT_ELEMENT = "Faktura"
FA3_XSD_PATH_GLOBS = {
    "ksef-api": [
        "faktury/schemy/FA/bazowe/*.xsd",
        "faktury/schemy/FA/schemat_FA(3)_*.xsd",
    ],
    "ksef-client-csharp": ["KSeF.Client.Tests.Core/Schemas/*.xsd"],
}
RETAINED_ADJACENT_XML = {
    "repository": "ksef-client-csharp",
    "sourcePath": "KSeF.Client.Tests.Core/Templates/invoice-template-fa-3-pef.xml",
    "namespace": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "rootElement": "Invoice",
}
EXPECTED_CENSUS_RULES = {
    "fa3XmlNamespace": FA3_XML_NAMESPACE,
    "fa3XmlRootElement": FA3_XML_ROOT_ELEMENT,
    "fa3XsdPathGlobs": FA3_XSD_PATH_GLOBS,
    "retainedAdjacentXml": RETAINED_ADJACENT_XML,
}
EXPECTED_REPOSITORY_SNAPSHOTS = [
    {
        "name": "ksef-api",
        "commit": "93b843d5def041f69fe2a26d0d90a53e9fa9987a",
        "defaultBranch": "main",
        "archive": {
            "sourceUrl": "https://codeload.github.com/CIRFMF/ksef-api/zip/93b843d5def041f69fe2a26d0d90a53e9fa9987a",
            "bytes": 1_930_976,
            "sha256": "5264ef22c44080597ee8676c6dfe20596f030eeaae82479f00036de017b15818",
        },
        "fa3XmlSourceRecords": 0,
        "fa3XsdSourceRecords": 4,
    },
    {
        "name": "ksef-client-csharp",
        "commit": "04f01c1c7834336a3aef1804149cd5bcbd883a3e",
        "defaultBranch": "main",
        "archive": {
            "sourceUrl": "https://codeload.github.com/CIRFMF/ksef-client-csharp/zip/04f01c1c7834336a3aef1804149cd5bcbd883a3e",
            "bytes": 1_653_125,
            "sha256": "738309e32b24e9eeadc8620782d84015cd48ee4ea977706d3fb404bf47bd9a2a",
        },
        "fa3XmlSourceRecords": 12,
        "fa3XsdSourceRecords": 2,
    },
    {
        "name": "ksef-client-java",
        "commit": "fd948a3d70c86335a216d988e52c697b59065a4c",
        "defaultBranch": "main",
        "archive": {
            "sourceUrl": "https://codeload.github.com/CIRFMF/ksef-client-java/zip/fd948a3d70c86335a216d988e52c697b59065a4c",
            "bytes": 932_858,
            "sha256": "43266d022764de1c003870c7d4fedf194978fe7a5733eaa92cf2a7241d3c318c",
        },
        "fa3XmlSourceRecords": 5,
        "fa3XsdSourceRecords": 0,
    },
    {
        "name": "ksef-latarnia",
        "commit": "b3d819616eb640270a2e11321d424f206d5e0b1a",
        "defaultBranch": "main",
        "archive": {
            "sourceUrl": "https://codeload.github.com/CIRFMF/ksef-latarnia/zip/b3d819616eb640270a2e11321d424f206d5e0b1a",
            "bytes": 7_840,
            "sha256": "cf5a289488f487625564b2d62dda7998c1e6eac5ebf36383dbbdf7da1ce51d0a",
        },
        "fa3XmlSourceRecords": 0,
        "fa3XsdSourceRecords": 0,
    },
    {
        "name": "ksef-pdf-generator",
        "commit": "1835553940728b8cb88f8b0298da732d56a3d2a5",
        "defaultBranch": "main",
        "archive": {
            "sourceUrl": "https://codeload.github.com/CIRFMF/ksef-pdf-generator/zip/1835553940728b8cb88f8b0298da732d56a3d2a5",
            "bytes": 409_910,
            "sha256": "d62b36fe243d5f324f411f75894768a87e5e729e597b765fce9a771df0508e33",
        },
        "fa3XmlSourceRecords": 1,
        "fa3XsdSourceRecords": 0,
    },
    {
        "name": "ksef-schematy",
        "commit": "cd826b831f74f73533ccf26876439ab8d9efdcf5",
        "defaultBranch": "main",
        "archive": {
            "sourceUrl": "https://codeload.github.com/CIRFMF/ksef-schematy/zip/cd826b831f74f73533ccf26876439ab8d9efdcf5",
            "bytes": 831,
            "sha256": "1bf774cba88c631208db9cdba295a6005aebd4636f1fa51016d92e634a071e9a",
        },
        "fa3XmlSourceRecords": 0,
        "fa3XsdSourceRecords": 0,
    },
]
DEFAULT_HEAD_TRANSPORT = (
    "proxy-disabled public-IP-pinned HTTPS with peer revalidation"
)
MAX_DEFAULT_HEAD_RESPONSE_BYTES = 64 * 1024
RAW_GITHUB = re.compile(
    r"^https://raw\.githubusercontent\.com/CIRFMF/([^/]+)/([a-f0-9]{40})/"
)


def load_upstream_verifier():
    sys.dont_write_bytecode = True
    path = ROOT / "scripts" / "verify-upstream-sources.py"
    spec = importlib.util.spec_from_file_location("upstream_verifier", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load the upstream verifier")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


UPSTREAM = load_upstream_verifier()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class RootFound(Exception):
    pass


def parse_root(data: bytes, label: str) -> tuple[str, str]:
    found: tuple[str, str] | None = None
    separator = "\x1f"
    parser = expat.ParserCreate(namespace_separator=separator)

    def on_start(name: str, _: dict[str, str]) -> None:
        nonlocal found
        if separator in name:
            namespace, local_name = name.rsplit(separator, 1)
        else:
            namespace, local_name = "", name
        found = namespace, local_name
        raise RootFound

    parser.StartElementHandler = on_start
    try:
        parser.Parse(data, True)
    except RootFound:
        pass
    except expat.ExpatError as error:
        raise ValueError(f"{label}: XML root is not parseable: {error}") from error
    if found is None:
        raise ValueError(f"{label}: XML root is missing")
    return found


class RejectRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: object, **kwargs: object) -> None:
        raise ValueError("GitHub default-head redirects are forbidden")


def default_head_url(repository: str, default_branch: str) -> str:
    if repository not in EXPECTED_REPOSITORIES or default_branch != "main":
        raise ValueError(f"{repository}: unexpected repository/default branch")
    return (
        f"https://api.github.com/repos/CIRFMF/{repository}/git/ref/heads/"
        f"{default_branch}"
    )


def verify_default_head(repository: str, default_branch: str) -> str:
    url = default_head_url(repository, default_branch)
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "PrzedWysylkaWebMCPLab-TreeCensus/1.0",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        RejectRedirectHandler(),
        UPSTREAM.PinnedHTTPSHandler(),
    )
    with opener.open(request, timeout=UPSTREAM.SOCKET_TIMEOUT_SECONDS) as response:
        if response.status != 200:
            raise RuntimeError(f"{repository}: default-head HTTP {response.status}")
        if response.geturl() != url:
            raise ValueError(f"{repository}: default-head response URL changed")
        content_length = response.headers.get("Content-Length")
        if content_length is not None:
            try:
                declared_bytes = int(content_length)
            except (TypeError, ValueError) as error:
                raise ValueError(
                    f"{repository}: invalid default-head Content-Length"
                ) from error
            if declared_bytes > MAX_DEFAULT_HEAD_RESPONSE_BYTES:
                raise ValueError(f"{repository}: default-head response is oversized")
        body = response.read(MAX_DEFAULT_HEAD_RESPONSE_BYTES + 1)
    if len(body) > MAX_DEFAULT_HEAD_RESPONSE_BYTES:
        raise ValueError(f"{repository}: default-head response is oversized")
    payload = json.loads(body)
    expected_ref = f"refs/heads/{default_branch}"
    if not isinstance(payload, dict) or payload.get("ref") != expected_ref:
        raise ValueError(f"{repository}: default-head ref identity is invalid")
    target = payload.get("object")
    if not isinstance(target, dict) or target.get("type") != "commit":
        raise ValueError(f"{repository}: default-head target is not a commit")
    head = target.get("sha")
    if not isinstance(head, str) or re.fullmatch(r"[a-f0-9]{40}", head) is None:
        raise ValueError(f"{repository}: default-head commit is invalid")
    return head


def relative_archive_paths(
    archive: zipfile.ZipFile, repository: str
) -> tuple[str, list[str]]:
    names = [info.filename for info in archive.infolist()]
    if len(names) != len(set(names)):
        raise ValueError(f"{repository}: archive contains duplicate member names")
    roots = {name.split("/", 1)[0] for name in names if name}
    if len(roots) != 1:
        raise ValueError(f"{repository}: archive does not have one root directory")
    root = roots.pop()
    paths: list[str] = []
    for info in archive.infolist():
        path = pathlib.PurePosixPath(info.filename)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError(f"{repository}: unsafe archive path {info.filename}")
        if info.is_dir():
            continue
        prefix = f"{root}/"
        if not info.filename.startswith(prefix):
            raise ValueError(f"{repository}: member escapes archive root")
        paths.append(info.filename[len(prefix) :])
    return root, sorted(paths)


def preflight_zip_directory(
    archive_bytes: bytes, repository: str
) -> dict[str, object]:
    signature = b"PK\x05\x06"
    offset = archive_bytes.rfind(signature, max(0, len(archive_bytes) - 65_557))
    if offset < 0 or offset + 22 > len(archive_bytes):
        raise ValueError(f"{repository}: ZIP end-of-central-directory is missing")
    (
        _,
        disk_number,
        central_directory_disk,
        entries_on_disk,
        total_entries,
        central_directory_bytes,
        central_directory_offset,
        comment_bytes,
    ) = struct.unpack_from("<4s4H2LH", archive_bytes, offset)
    if offset + 22 + comment_bytes != len(archive_bytes):
        raise ValueError(f"{repository}: ZIP has trailing or malformed EOCD bytes")
    if disk_number != 0 or central_directory_disk != 0:
        raise ValueError(f"{repository}: multi-disk ZIP archives are forbidden")
    if entries_on_disk != total_entries:
        raise ValueError(f"{repository}: split ZIP entry counts are forbidden")
    if (
        total_entries == 0xFFFF
        or central_directory_bytes == 0xFFFFFFFF
        or central_directory_offset == 0xFFFFFFFF
    ):
        raise ValueError(f"{repository}: ZIP64 archives are forbidden")
    if total_entries > MAX_ARCHIVE_MEMBERS:
        raise ValueError(
            f"{repository}: archive declares {total_entries} members, limit is {MAX_ARCHIVE_MEMBERS}"
        )
    central_directory_end = central_directory_offset + central_directory_bytes
    zip64_gap = archive_bytes[min(central_directory_end, offset) : offset]
    if (
        (offset >= 20 and archive_bytes[offset - 20 : offset - 16] == b"PK\x06\x07")
        or b"PK\x06\x06" in zip64_gap
        or b"PK\x06\x07" in zip64_gap
    ):
        raise ValueError(f"{repository}: ZIP64 records are forbidden")
    if central_directory_end != offset:
        raise ValueError(f"{repository}: ZIP central directory bounds are invalid")

    members: dict[str, dict[str, int]] = {}
    local_ranges: list[tuple[int, int, str]] = []
    total_uncompressed = 0
    cursor = central_directory_offset
    for _ in range(total_entries):
        if cursor + 46 > central_directory_end:
            raise ValueError(f"{repository}: truncated ZIP central directory entry")
        (
            central_signature,
            _,
            _,
            flags,
            compression,
            _,
            _,
            crc32,
            compressed_bytes,
            uncompressed_bytes,
            filename_bytes,
            extra_bytes,
            member_comment_bytes,
            member_disk,
            _,
            _,
            local_header_offset,
        ) = struct.unpack_from("<4s6H3I5H2I", archive_bytes, cursor)
        if central_signature != b"PK\x01\x02":
            raise ValueError(f"{repository}: invalid ZIP central directory signature")
        if member_disk != 0:
            raise ValueError(f"{repository}: split ZIP members are forbidden")
        if flags != 0:
            raise ValueError(f"{repository}: ZIP member flags are forbidden")
        if compression not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
            raise ValueError(f"{repository}: unsupported ZIP compression method")
        record_end = (
            cursor + 46 + filename_bytes + extra_bytes + member_comment_bytes
        )
        if record_end > central_directory_end:
            raise ValueError(f"{repository}: ZIP central directory entry escapes bounds")
        raw_name = archive_bytes[cursor + 46 : cursor + 46 + filename_bytes]
        try:
            filename = raw_name.decode("cp437")
        except UnicodeDecodeError as error:  # pragma: no cover - cp437 is total
            raise ValueError(f"{repository}: ZIP member name is not decodable") from error
        if not filename or "\x00" in filename or "\\" in filename:
            raise ValueError(f"{repository}: unsafe ZIP member name")
        path = pathlib.PurePosixPath(filename)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError(f"{repository}: unsafe archive path {filename}")
        if filename in members:
            raise ValueError(f"{repository}: archive contains duplicate member names")
        if local_header_offset + 30 > central_directory_offset:
            raise ValueError(f"{repository}: ZIP local header bounds are invalid")
        (
            local_signature,
            _,
            local_flags,
            local_compression,
            _,
            _,
            local_crc32,
            local_compressed_bytes,
            local_uncompressed_bytes,
            local_filename_bytes,
            local_extra_bytes,
        ) = struct.unpack_from("<4s5H3I2H", archive_bytes, local_header_offset)
        if local_signature != b"PK\x03\x04":
            raise ValueError(f"{repository}: invalid ZIP local header signature")
        if (
            local_flags != flags
            or local_compression != compression
            or local_crc32 != crc32
            or local_compressed_bytes != compressed_bytes
            or local_uncompressed_bytes != uncompressed_bytes
        ):
            raise ValueError(
                f"{repository}: ZIP central/local member metadata mismatch"
            )
        local_name_start = local_header_offset + 30
        local_name_end = local_name_start + local_filename_bytes
        data_start = local_name_end + local_extra_bytes
        data_end = data_start + compressed_bytes
        if data_end > central_directory_offset:
            raise ValueError(f"{repository}: ZIP compressed member escapes bounds")
        if archive_bytes[local_name_start:local_name_end] != raw_name:
            raise ValueError(f"{repository}: ZIP central/local member name mismatch")
        if compression == zipfile.ZIP_STORED and compressed_bytes != uncompressed_bytes:
            raise ValueError(f"{repository}: stored ZIP member sizes do not match")

        total_uncompressed += uncompressed_bytes
        if total_uncompressed > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
            raise ValueError(
                f"{repository}: archive expands beyond {MAX_ARCHIVE_UNCOMPRESSED_BYTES} bytes"
            )
        if (
            pathlib.PurePosixPath(filename).suffix.lower() in {".xml", ".xsd"}
            and uncompressed_bytes > UPSTREAM.MAX_ZIP_MEMBER_BYTES
        ):
            raise ValueError(
                f"{repository}:{filename}: XML/XSD member exceeds {UPSTREAM.MAX_ZIP_MEMBER_BYTES} bytes"
            )
        members[filename] = {
            "crc32": crc32,
            "compressedBytes": compressed_bytes,
            "uncompressedBytes": uncompressed_bytes,
            "compression": compression,
            "flags": flags,
            "localHeaderOffset": local_header_offset,
        }
        local_ranges.append((local_header_offset, data_end, filename))
        cursor = record_end

    if cursor != central_directory_end or len(members) != total_entries:
        raise ValueError(f"{repository}: ZIP central directory count/bounds mismatch")
    local_ranges.sort()
    for previous, current in zip(local_ranges, local_ranges[1:]):
        if current[0] < previous[1]:
            raise ValueError(
                f"{repository}: ZIP local member ranges overlap ({previous[2]}, {current[2]})"
            )
    return {
        "memberCount": total_entries,
        "totalUncompressedBytes": total_uncompressed,
        "members": members,
    }


def validate_zipfile_metadata(
    archive: zipfile.ZipFile, preflight: dict[str, object], repository: str
) -> None:
    expected = preflight["members"]
    if not isinstance(expected, dict):
        raise TypeError("invalid ZIP preflight metadata")
    infos = archive.infolist()
    if len(infos) != preflight["memberCount"]:
        raise ValueError(f"{repository}: parsed member count differs from preflight")
    if {info.filename for info in infos} != set(expected):
        raise ValueError(f"{repository}: parsed member names differ from preflight")
    for info in infos:
        metadata = expected[info.filename]
        observed = {
            "crc32": info.CRC,
            "compressedBytes": info.compress_size,
            "uncompressedBytes": info.file_size,
            "compression": info.compress_type,
            "flags": info.flag_bits,
            "localHeaderOffset": info.header_offset,
        }
        if observed != metadata:
            raise ValueError(
                f"{repository}:{info.filename}: ZipFile metadata differs from preflight"
            )


def matches_any(path: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)


def raw_repository(url: str) -> str | None:
    match = RAW_GITHUB.match(url)
    return match.group(1) if match else None


def validate_repository_snapshots(repositories: object) -> None:
    constant_names = tuple(
        record["name"] for record in EXPECTED_REPOSITORY_SNAPSHOTS
    )
    if constant_names != EXPECTED_REPOSITORIES:
        raise RuntimeError("verifier repository constants disagree")
    if repositories != EXPECTED_REPOSITORY_SNAPSHOTS:
        raise RuntimeError(
            "scope repository snapshots do not match verifier-owned constants"
        )


def verify(report_path: pathlib.Path | None) -> dict[str, object]:
    manifest_bytes = MANIFEST_PATH.read_bytes()
    scope_bytes = SCOPE_PATH.read_bytes()
    manifest = json.loads(manifest_bytes)
    scope = json.loads(scope_bytes)
    validate_repository_snapshots(scope["cirfmfRepositories"])
    repositories = EXPECTED_REPOSITORY_SNAPSHOTS

    if scope["cirfmfCensusRules"] != EXPECTED_CENSUS_RULES:
        raise RuntimeError("scope census rules do not match verifier constants")
    rules = EXPECTED_CENSUS_RULES
    allowed_urls, pins = UPSTREAM.build_url_policy(manifest, scope)
    errors: list[str] = []
    repository_reports: list[dict[str, object]] = []
    discovered_fa3_xml: set[tuple[str, str]] = set()
    discovered_fa3_xsd: set[tuple[str, str]] = set()
    root_index: dict[tuple[str, str], tuple[str, str]] = {}

    for repository in repositories:
        name = str(repository["name"])
        pin = str(repository["commit"])
        default_branch = str(repository["defaultBranch"])
        remote_url = f"https://github.com/CIRFMF/{name}.git"
        archive_record = repository["archive"]
        try:
            current_head = verify_default_head(name, default_branch)
        except (OSError, RuntimeError, ValueError) as error:
            errors.append(str(error))
            current_head = ""
        if current_head != pin:
            errors.append(
                f"{name}: current default HEAD {current_head!r} does not equal pin {pin}"
            )

        try:
            archive_bytes = UPSTREAM.fetch(
                str(archive_record["sourceUrl"]),
                int(archive_record["bytes"]),
                allowed_urls,
                pins,
            )
        except Exception as error:
            errors.append(f"{name}: archive fetch failed: {error}")
            continue
        actual_archive_sha = sha256(archive_bytes)
        if actual_archive_sha != archive_record["sha256"]:
            errors.append(
                f"{name}: archive SHA-256 {actual_archive_sha} does not match verifier lock"
            )
            continue

        xml_paths: list[str] = []
        xsd_paths: list[str] = []
        fa3_xml_paths: list[str] = []
        fa3_xsd_paths: list[str] = []
        malformed_xml_paths: list[str] = []
        xml_roots: list[dict[str, str]] = []
        xsd_roots: list[dict[str, str]] = []
        preflight = preflight_zip_directory(archive_bytes, name)
        archive_member_count = int(preflight["memberCount"])
        total_uncompressed = int(preflight["totalUncompressedBytes"])
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            validate_zipfile_metadata(archive, preflight, name)
            _, file_paths = relative_archive_paths(archive, name)
            infos = {
                info.filename.split("/", 1)[1]: info
                for info in archive.infolist()
                if not info.is_dir()
            }
            for path in file_paths:
                suffix = pathlib.PurePosixPath(path).suffix.lower()
                if suffix not in {".xml", ".xsd"}:
                    continue
                info = infos[path]
                try:
                    data = UPSTREAM.read_zip_member(
                        archive,
                        info.filename,
                        info.file_size,
                        f"{name}:{path}",
                    )
                    namespace, root_element = parse_root(data, f"{name}:{path}")
                except (KeyError, OSError, ValueError, TimeoutError) as error:
                    malformed_xml_paths.append(path)
                    errors.append(str(error))
                    continue
                root_index[(name, path)] = namespace, root_element
                root_record = {
                    "path": path,
                    "namespace": namespace,
                    "rootElement": root_element,
                }
                if suffix == ".xml":
                    xml_paths.append(path)
                    xml_roots.append(root_record)
                    if (
                        namespace == rules["fa3XmlNamespace"]
                        and root_element == rules["fa3XmlRootElement"]
                    ):
                        fa3_xml_paths.append(path)
                        discovered_fa3_xml.add((name, path))
                else:
                    xsd_paths.append(path)
                    xsd_roots.append(root_record)
                    patterns = rules["fa3XsdPathGlobs"].get(name, [])
                    if matches_any(path, patterns):
                        if (
                            namespace != "http://www.w3.org/2001/XMLSchema"
                            or root_element != "schema"
                        ):
                            errors.append(
                                f"{name}:{path}: census XSD rule matched a non-schema root"
                            )
                        fa3_xsd_paths.append(path)
                        discovered_fa3_xsd.add((name, path))

        fa3_xml_paths.sort()
        fa3_xsd_paths.sort()
        xml_paths.sort()
        xsd_paths.sort()
        if len(fa3_xml_paths) != int(repository["fa3XmlSourceRecords"]):
            errors.append(
                f"{name}: discovered {len(fa3_xml_paths)} FA(3) XML paths, scope declares {repository['fa3XmlSourceRecords']}"
            )
        if len(fa3_xsd_paths) != int(repository["fa3XsdSourceRecords"]):
            errors.append(
                f"{name}: discovered {len(fa3_xsd_paths)} FA(3) XSD paths, scope declares {repository['fa3XsdSourceRecords']}"
            )
        repository_reports.append(
            {
                "name": name,
                "remoteUrl": remote_url,
                "defaultHeadUrl": default_head_url(name, default_branch),
                "defaultHeadTransport": DEFAULT_HEAD_TRANSPORT,
                "defaultBranch": default_branch,
                "pinnedCommit": pin,
                "currentDefaultHead": current_head,
                "defaultHeadMatchesPin": current_head == pin,
                "archive": archive_record,
                "archiveMemberCount": archive_member_count,
                "fileCount": len(file_paths),
                "totalUncompressedBytes": total_uncompressed,
                "xmlPaths": xml_paths,
                "xsdPaths": xsd_paths,
                "fa3XmlPaths": fa3_xml_paths,
                "fa3XsdPaths": fa3_xsd_paths,
                "excludedXmlPaths": sorted(set(xml_paths) - set(fa3_xml_paths)),
                "excludedXsdPaths": sorted(set(xsd_paths) - set(fa3_xsd_paths)),
                "malformedXmlPaths": sorted(malformed_xml_paths),
                "xmlRoots": sorted(xml_roots, key=lambda record: record["path"]),
                "xsdRoots": sorted(xsd_roots, key=lambda record: record["path"]),
            }
        )

    manifest_fa3_xml = {
        (raw_repository(asset["sourceUrl"]), asset["sourcePath"])
        for asset in manifest["assets"]
        if asset["kind"] == "xml"
        and asset["namespace"] == rules["fa3XmlNamespace"]
        and raw_repository(asset["sourceUrl"]) is not None
    }
    manifest_fa3_xsd = {
        (raw_repository(asset["sourceUrl"]), asset["sourcePath"])
        for asset in manifest["assets"]
        if asset["kind"] == "xsd"
        and raw_repository(asset["sourceUrl"]) is not None
    }
    if discovered_fa3_xml != manifest_fa3_xml:
        errors.append(
            f"discovered/manifest FA(3) XML set mismatch: discovered={sorted(discovered_fa3_xml)!r}, manifest={sorted(manifest_fa3_xml)!r}"
        )
    if discovered_fa3_xsd != manifest_fa3_xsd:
        errors.append(
            f"discovered/manifest FA(3) XSD set mismatch: discovered={sorted(discovered_fa3_xsd)!r}, manifest={sorted(manifest_fa3_xsd)!r}"
        )

    adjacent = rules["retainedAdjacentXml"]
    adjacent_key = (adjacent["repository"], adjacent["sourcePath"])
    if root_index.get(adjacent_key) != (
        adjacent["namespace"],
        adjacent["rootElement"],
    ):
        errors.append("retained adjacent XML root does not match the census rule")
    manifest_adjacent = [
        asset
        for asset in manifest["assets"]
        if asset["kind"] == "xml" and asset["role"] == "related-ubl"
    ]
    if len(manifest_adjacent) != 1 or (
        raw_repository(manifest_adjacent[0]["sourceUrl"]),
        manifest_adjacent[0]["sourcePath"],
    ) != adjacent_key:
        errors.append("retained adjacent XML does not match the manifest")

    if errors:
        raise RuntimeError("CIRFMF tree census failed:\n- " + "\n- ".join(errors))

    totals = {
        "repositories": len(repository_reports),
        "xmlPaths": sum(len(record["xmlPaths"]) for record in repository_reports),
        "xsdPaths": sum(len(record["xsdPaths"]) for record in repository_reports),
        "fa3XmlPaths": len(discovered_fa3_xml),
        "fa3XsdPaths": len(discovered_fa3_xsd),
        "retainedAdjacentXml": 1,
    }
    report: dict[str, object] = {
        "schemaVersion": 1,
        "observedAt": scope["observedAt"],
        "censusMethod": (
            "immutable codeload archives plus public-IP-pinned GitHub REST heads; "
            "verifier-owned repository snapshots and XML/XSD rules independent "
            "of the asset manifest and scope ledger"
        ),
        "manifestSha256": sha256(manifest_bytes),
        "sourceScopeSha256": sha256(scope_bytes),
        "allMatched": True,
        "defaultHeadsVerified": all(
            record["defaultHeadMatchesPin"] for record in repository_reports
        ),
        "scopeSnapshotLocked": True,
        "censusRules": EXPECTED_CENSUS_RULES,
        "totals": totals,
        "archiveLimits": {
            "maxMembersPerArchive": MAX_ARCHIVE_MEMBERS,
            "maxUncompressedBytesPerArchive": MAX_ARCHIVE_UNCOMPRESSED_BYTES,
            "maxXmlOrXsdMemberBytes": UPSTREAM.MAX_ZIP_MEMBER_BYTES,
        },
        "repositories": repository_reports,
        "retainedAdjacentXml": adjacent,
    }
    if report_path is not None:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_bytes(
            (json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        )
    return report


def run_archive_safety_self_test() -> list[str]:
    def expect_rejected(callback, expected: str) -> None:
        try:
            callback()
        except ValueError as error:
            if expected not in str(error):
                raise AssertionError(
                    f"hostile archive fixture failed for the wrong reason: {error}"
                ) from error
            return
        raise AssertionError("hostile archive fixture was accepted")

    def single_member_archive() -> bytearray:
        output = io.BytesIO()
        with zipfile.ZipFile(
            output, "w", compression=zipfile.ZIP_DEFLATED
        ) as archive:
            archive.writestr("root/a.xml", b"<a/>")
        return bytearray(output.getvalue())

    def directory_offsets(data: bytearray) -> tuple[int, int]:
        eocd_offset = data.rfind(b"PK\x05\x06")
        central_offset = struct.unpack_from("<I", data, eocd_offset + 16)[0]
        local_offset = struct.unpack_from("<I", data, central_offset + 42)[0]
        return central_offset, local_offset

    def size_fixture(uncompressed_bytes: int) -> bytes:
        data = single_member_archive()
        central_offset, local_offset = directory_offsets(data)
        struct.pack_into("<I", data, central_offset + 24, uncompressed_bytes)
        struct.pack_into("<I", data, local_offset + 22, uncompressed_bytes)
        return bytes(data)

    too_many_members = struct.pack(
        "<4s4H2LH",
        b"PK\x05\x06",
        0,
        0,
        MAX_ARCHIVE_MEMBERS + 1,
        MAX_ARCHIVE_MEMBERS + 1,
        0,
        0,
        0,
    )
    expect_rejected(
        lambda: preflight_zip_directory(too_many_members, "member-count fixture"),
        "limit is",
    )
    passed = ["member-count"]

    zip64_record = single_member_archive()
    zip64_eocd_offset = zip64_record.rfind(b"PK\x05\x06")
    zip64_record[zip64_eocd_offset:zip64_eocd_offset] = b"PK\x06\x07" + bytes(16)
    expect_rejected(
        lambda: preflight_zip_directory(bytes(zip64_record), "ZIP64 fixture"),
        "ZIP64 records are forbidden",
    )
    passed.append("zip64-record")

    expect_rejected(
        lambda: preflight_zip_directory(
            size_fixture(MAX_ARCHIVE_UNCOMPRESSED_BYTES + 1),
            "total-expansion fixture",
        ),
        "archive expands beyond",
    )
    passed.append("total-expansion")

    expect_rejected(
        lambda: preflight_zip_directory(
            size_fixture(UPSTREAM.MAX_ZIP_MEMBER_BYTES + 1),
            "member-size fixture",
        ),
        "XML/XSD member exceeds",
    )
    passed.append("xml-xsd-member-size")

    central_local_mismatch = single_member_archive()
    _, local_offset = directory_offsets(central_local_mismatch)
    local_crc32 = struct.unpack_from("<I", central_local_mismatch, local_offset + 14)[0]
    struct.pack_into("<I", central_local_mismatch, local_offset + 14, local_crc32 ^ 1)
    expect_rejected(
        lambda: preflight_zip_directory(
            bytes(central_local_mismatch), "central-local fixture"
        ),
        "central/local member metadata mismatch",
    )
    passed.append("central-local-bounds")

    duplicate_bytes = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        with zipfile.ZipFile(duplicate_bytes, "w") as archive:
            archive.writestr("root/a.xml", b"<a/>")
            archive.writestr("root/a.xml", b"<a/>")
    expect_rejected(
        lambda: preflight_zip_directory(
            duplicate_bytes.getvalue(), "duplicate fixture"
        ),
        "duplicate member names",
    )
    passed.append("duplicate-name")

    unsafe_bytes = io.BytesIO()
    with zipfile.ZipFile(unsafe_bytes, "w") as archive:
        archive.writestr("root/../outside.xml", b"<a/>")
    expect_rejected(
        lambda: preflight_zip_directory(unsafe_bytes.getvalue(), "unsafe fixture"),
        "unsafe archive path",
    )
    passed.append("unsafe-path")
    return passed


def run_snapshot_lock_self_test() -> list[str]:
    mutations: list[tuple[str, tuple[str, ...], object]] = [
        ("name", ("name",), "redirected-repository"),
        ("defaultBranch", ("defaultBranch",), "different-branch"),
        ("commit", ("commit",), "0" * 40),
        (
            "archive.sourceUrl",
            ("archive", "sourceUrl"),
            "https://codeload.github.com/CIRFMF/ksef-api/zip/" + "0" * 40,
        ),
        ("archive.bytes", ("archive", "bytes"), 1),
        ("archive.sha256", ("archive", "sha256"), "0" * 64),
        ("fa3XmlSourceRecords", ("fa3XmlSourceRecords",), 999),
        ("fa3XsdSourceRecords", ("fa3XsdSourceRecords",), 999),
    ]
    passed: list[str] = []
    for label, path, value in mutations:
        for repository_index in range(len(EXPECTED_REPOSITORY_SNAPSHOTS)):
            mutated = copy.deepcopy(EXPECTED_REPOSITORY_SNAPSHOTS)
            target = mutated[repository_index]
            for segment in path[:-1]:
                nested = target[segment]
                if not isinstance(nested, dict):
                    raise AssertionError(f"invalid mutation path: {label}")
                target = nested
            target[path[-1]] = value
            try:
                validate_repository_snapshots(mutated)
            except RuntimeError:
                continue
            raise AssertionError(
                f"snapshot mutation was accepted: {repository_index}:{label}"
            )
        passed.append(label)
    return passed


def main() -> None:
    parser = argparse.ArgumentParser()
    report_group = parser.add_mutually_exclusive_group()
    report_group.add_argument(
        "--write-report",
        action="store_true",
        help="write docs/assets/cirfmf-tree-census.json after a complete pass",
    )
    report_group.add_argument(
        "--report-path",
        type=pathlib.Path,
        help="write a complete pass to an explicit evidence path",
    )
    parser.add_argument(
        "--self-test-safety",
        action="store_true",
        help="exercise ZIP structural, expansion, member-size, duplicate, and path guards",
    )
    parser.add_argument(
        "--self-test-snapshot-lock",
        action="store_true",
        help="exercise every verifier-owned repository snapshot field",
    )
    arguments = parser.parse_args()
    if arguments.self_test_safety:
        print(
            "archive safety self-test: "
            + ", ".join(run_archive_safety_self_test())
        )
        return
    if arguments.self_test_snapshot_lock:
        print(
            "snapshot lock self-test: "
            + ", ".join(run_snapshot_lock_self_test())
        )
        return
    report_path = (
        DEFAULT_REPORT
        if arguments.write_report
        else arguments.report_path
    )
    report = verify(report_path)
    print(
        "CIRFMF tree census verified: "
        f"{report['totals']['repositories']} default-branch heads, "
        f"{report['totals']['fa3XmlPaths']} FA(3) XML paths, and "
        f"{report['totals']['fa3XsdPaths']} FA(3) XSD paths."
    )


if __name__ == "__main__":
    main()
