# FILE: .formatter.exs
# PURPOSE: Elixir code formatter configuration for the umbrella root +
#          all child apps. Run via `mix format` (or
#          `mix format --check-formatted` for CI).
# CONNECTS TO:
#   docs/architecture/decisions/0030-phase-2-elixir-beam-implementation.md
#     (§Implementation Detail mix umbrella workspace structure).
#   apps/*/.formatter.exs (per-app formatter configs land with each
#     OTP app skeleton at sub-phases 3 + 7).
# WHY: Umbrella-aware formatter config; `subdirectories: ["apps/*"]`
#      tells mix to also load per-app .formatter.exs files when present.

[
  inputs: [
    "{mix,.formatter}.exs",
    "{config,apps}/**/*.{ex,exs}"
  ],
  subdirectories: ["apps/*"]
]
