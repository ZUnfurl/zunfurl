# Third-party notices

ZUnfurl is released as source code. The repository does not redistribute `node_modules`,
downloaded FFmpeg executables, prebuilt Sharp/libvips packages, container images, or an
unreviewed application bundle. Installing dependencies downloads third-party packages
from their own distributors; those packages remain governed by their respective terms
and are not relicensed under this project's Apache-2.0 license.

The version-complete inventory is [`sbom.cdx.json`](sbom.cdx.json). Exact review rules,
versions, evidence, and re-review triggers are recorded in
[`docs/compliance/dependency-license-policy.json`](docs/compliance/dependency-license-policy.json).
This notice highlights dependencies that require more than the repository's ordinary
permissive-license allowlist; it is not a substitute for the upstream license texts.

## FFmpeg development tooling

`ffmpeg-static` is a GPL-3.0-or-later development dependency used only by the local
brand-video optimization script. Its npm package downloads platform-specific FFmpeg
binaries. Those binaries and `node_modules` are excluded from every ZUnfurl Preview
release. See the [ffmpeg-static repository and license](https://github.com/eugeneware/ffmpeg-static).

Anyone who changes this project to redistribute an FFmpeg binary, container, desktop
application, server image, or other binary-bearing artifact must perform a new
artifact-level review and satisfy the applicable upstream source, license, and notice
requirements before distribution.

## Sharp and libvips platform packages

Sharp declares Apache-2.0. Its optional `@img/sharp-*` platform packages can include
prebuilt libvips material with LGPL-3.0-or-later declarations in npm metadata. The
source-only release does not contain those platform packages or libvips binaries.
See the [Sharp repository](https://github.com/lovell/sharp) and
[sharp-libvips build repository](https://github.com/lovell/sharp-libvips).

Vendoring `node_modules`, shipping a Lambda layer, executable, container, or other
artifact that includes these packages requires a fresh artifact-level review and
retention of applicable upstream license material.

## MPL-2.0 packages

The dependency graph includes unmodified `lightningcss` platform packages and
`@vercel/stega` under MPL-2.0 declarations. ZUnfurl neither vendors nor modifies their
covered source files. See the [Lightning CSS repository](https://github.com/parcel-bundler/lightningcss)
and [Vercel Stega repository](https://github.com/vercel/stega). If MPL-covered files are
vendored or modified, their file-level source and notice obligations must be reviewed
before distribution.

## Creative Commons data attribution

- Caniuse browser-support data is created and maintained by Alexis Deveria and
  contributors, sourced from [caniuse.com via the official repository](https://github.com/Fyrd/caniuse),
  and declared CC-BY-4.0 by the upstream project.
- `spdx-exceptions` derives SPDX license-exception identifiers from work by The Linux
  Foundation and SPDX contributors. The installed package declares CC-BY-3.0 and
  documents its attribution in the
  [upstream repository](https://github.com/kemitchell/spdx-exceptions.json).

These data sets are not covered by ZUnfurl's Apache-2.0 license. Their attributions must
remain associated with any redistribution of the corresponding data.

## Concluded licenses for incomplete npm metadata

The lockfile currently lacks a modern `license` field for two legacy transitive
packages. The SBOM records a concluded license only for the exact package path and
version reviewed:

- `md5-o-matic@0.1.1`: MIT, based on the license shipped in the npm tarball and the
  [upstream MIT license](https://github.com/trentmillar/md5-o-matic/blob/master/LICENSE).
- `parse-cache-control@1.0.1`: BSD-3-Clause, based on the three-clause BSD text shipped
  in the npm tarball and the [upstream license](https://github.com/roryf/parse-cache-control/blob/master/LICENSE).

`jsonify@0.0.1` declares its legacy npm license metadata as `Public Domain`. Because
that is free text rather than an SPDX identifier, the dependency is accepted only by
an exact package/version review rule and is not added to the global SPDX allowlist.

An integrity, version, package-path, or upstream-license change invalidates these
conclusions and must fail the local license gate until reviewed.

## Scope of this notice

The SBOM and policy cover the complete npm lock graph, including production,
development, and optional packages. They do not claim that every package is present in
a release artifact. ZUnfurl's distribution decision is deliberately narrower:
tracked source plus release documents and the SBOM, with third-party binary and
dependency directories excluded.

This document is an engineering compliance record, not legal advice.
