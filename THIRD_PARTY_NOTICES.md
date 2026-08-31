# Third-Party Notices

The project MIT license covers original source code in this repository. It does not relicense official XML/XSD source material or third-party packages.

An additional license-boundary notice is stored directly beside the bundled files at [`public/official-assets/NOTICE.md`](public/official-assets/NOTICE.md). It remains part of every static build but is not one of the 55 locked XML/XSD source records.

## Ministry of Finance / Krajowy System e-Faktur

The repository includes unmodified example XML files downloaded from the official KSeF 2.0 download page:

- Page: https://ksef.podatki.gov.pl/pliki-do-pobrania-ksef-20
- Archive: https://ksef.podatki.gov.pl/media/e5cia0ey/przykladowe-pliki-dla-struktury-logicznej-e-faktury-fa-3.zip
- Frozen archive SHA-256: `41ebd3c57144951c65d68a36fbe433285b5791a86a8bd46cb059503e3f8b1e10`

These materials are retained byte-for-byte for validation, interoperability, provenance, and demonstration. All rights and attribution remain with their respective public-sector source. The project makes no ownership claim over them.

## Central Repository of Electronic Document Templates (CRD)

The canonical FA(3) schema and its complete transitive dependency closure come from official CRD records:

- FA(3) record: https://crd.gov.pl/wzor/2025/06/25/13775/
- Root XSD: https://crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd
- Dependency namespace: https://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/

The four canonical XSD files are preserved unmodified under `public/official-assets/crd/`. Runtime-only resolver aliases are generated in memory; official source bytes are never rewritten.

## CIRFMF first-party repositories

The frozen corpus includes source records from these exact revisions:

| Repository                                   | Commit                                     | License and copyright notice                                                                                                                          |
| -------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| https://github.com/CIRFMF/ksef-client-csharp | `04f01c1c7834336a3aef1804149cd5bcbd883a3e` | [MIT; Copyright © 2025 Ministerstwo Finansów](https://github.com/CIRFMF/ksef-client-csharp/blob/04f01c1c7834336a3aef1804149cd5bcbd883a3e/LICENCE.txt) |
| https://github.com/CIRFMF/ksef-client-java   | `fd948a3d70c86335a216d988e52c697b59065a4c` | [MIT; Copyright © 2025 Ministerstwo Finansów](https://github.com/CIRFMF/ksef-client-java/blob/fd948a3d70c86335a216d988e52c697b59065a4c/LICENSE.md)    |
| https://github.com/CIRFMF/ksef-pdf-generator | `1835553940728b8cb88f8b0298da732d56a3d2a5` | [MIT; Copyright © 2025 CIRF](https://github.com/CIRFMF/ksef-pdf-generator/blob/1835553940728b8cb88f8b0298da732d56a3d2a5/LICENSE)                      |
| https://github.com/CIRFMF/ksef-api           | `93b843d5def041f69fe2a26d0d90a53e9fa9987a` | [MIT; Copyright © 2025 Ministerstwo Finansów](https://github.com/CIRFMF/ksef-api/blob/93b843d5def041f69fe2a26d0d90a53e9fa9987a/LICENSE.txt)           |

Exact byte copies of the upstream notices are retained in the deployed source tree:

- [`public/third-party/cirfmf/ksef-client-csharp/LICENCE.txt`](public/third-party/cirfmf/ksef-client-csharp/LICENCE.txt)
- [`public/third-party/cirfmf/ksef-client-java/LICENSE.md`](public/third-party/cirfmf/ksef-client-java/LICENSE.md)
- [`public/third-party/cirfmf/ksef-pdf-generator/LICENSE`](public/third-party/cirfmf/ksef-pdf-generator/LICENSE)
- [`public/third-party/cirfmf/ksef-api/LICENSE.txt`](public/third-party/cirfmf/ksef-api/LICENSE.txt)

`npm run verify:upstreams` re-downloads all four pinned raw notice URLs, enforces their declared byte limits, and compares both their SHA-256 values and exact bytes with these local copies. The manifest/scope-bound result is recorded in [`docs/assets/upstream-verification.json`](docs/assets/upstream-verification.json).

The C# client's nested PDF-test fixture is byte-identical to the canonical `ksef-pdf-generator` source and is retained as a separate provenance record with `contentDuplicateOf`.

The repository-level MIT notices are evidence of each upstream software repository's declared license. They do not, by themselves, establish separate reuse terms for every official XML fixture or schema. Public redistribution of the bundled official-source corpus remains gated pending confirmation of the applicable MF/CRD terms and asset-level provenance for the PDF-generator XML.

## JavaScript dependencies

Direct runtime dependencies:

- `react` / `react-dom` — MIT
- `xmllint-wasm` — MIT; includes libxml2 components under their upstream terms
- `zod` — MIT
- `diff` — BSD-3-Clause
- `webmcp-types` — MIT (development type declarations)

Development/test dependencies retain the licenses recorded in `package-lock.json` and their distributed package metadata. `@axe-core/playwright` is MPL-2.0 and is used only for testing.

## Exact per-file provenance

`data/official-assets.lock.json` is the authoritative machine-readable ledger for source URL, source path, pinned revision, SHA-256, byte count, namespace, and role of every bundled official XML/XSD record.
