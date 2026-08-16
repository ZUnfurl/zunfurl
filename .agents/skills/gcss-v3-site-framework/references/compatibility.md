# Compatibility

- Record the source framework version in `gcss.project.json`.
- Keep template releases tagged and document migrations outside the Skill.
- Treat API versions as pinned compatibility inputs, not "latest" placeholders.
- Upgrade Sanity, Shopify API, Astro, Node, or Wrangler versions only after their profile matrix passes.
- A client project may customize visuals and content, but should preserve internal `gcss-*` package names and profile contracts to reduce framework update conflicts.
- Run `npm.cmd run framework:audit` before adopting a newer template release.

The Skill must fail clearly when required project scripts, config schema version, or framework major version are incompatible.
