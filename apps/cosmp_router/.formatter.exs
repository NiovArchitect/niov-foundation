# App-level formatter config for cosmp_router.
# Inherits umbrella-level config (../../.formatter.exs) via
# `subdirectories: ["apps/*"]` at the umbrella root.
# Sub-phase 3: empty import_deps (no app-level deps yet per Q3).
# Sub-phase 4+: import_deps populates as :ecto, :phoenix, etc. arrive
# with their consumers.
[
  inputs: [
    "mix.exs",
    ".formatter.exs",
    "{config,lib,test}/**/*.{ex,exs}"
  ],
  import_deps: []
]
