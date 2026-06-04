# Collaboration Supervisor — Elixir/Erlang/OTP BEAM service.
#
# Build (from repo root so the umbrella mix.exs + deps/ are visible):
#   docker build -t niov/collaboration-supervisor:dev \
#     -f apps/collaboration_supervisor/Dockerfile .
#
# Run:
#   docker run --rm -p 4001:4001 \
#     -e COLLAB_SUPERVISOR_PORT=4001 \
#     niov/collaboration-supervisor:dev
#
# Point Foundation at it:
#   BEAM_RUNTIME_ENABLED=true BEAM_RUNTIME_URL=http://localhost:4001 npm run dev

FROM hexpm/elixir:1.19.5-erlang-28.5.0-debian-bookworm-20251229-slim AS build

ENV MIX_ENV=prod \
    LANG=C.UTF-8 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /repo

# Umbrella plumbing
COPY mix.exs mix.lock .tool-versions ./
COPY config ./config
RUN mkdir -p apps

# Only the apps the supervisor depends on need to be present at compile time
# for THIS service's build. We copy the supervisor app + its umbrella sibling
# stubs to satisfy `apps_paths`.
COPY apps/cosmp_router/mix.exs apps/cosmp_router/mix.exs
RUN mkdir -p apps/cosmp_router/lib apps/cosmp_router/test
COPY apps/dbgi_supervisor/mix.exs apps/dbgi_supervisor/mix.exs
RUN mkdir -p apps/dbgi_supervisor/lib apps/dbgi_supervisor/test
COPY apps/collaboration_supervisor apps/collaboration_supervisor

RUN mix local.hex --force && \
    mix local.rebar --force && \
    mix deps.get --only prod

# Compile only the supervisor app + its direct deps.
RUN MIX_ENV=prod mix do deps.compile, compile --only collaboration_supervisor

# --- Runtime --------------------------------------------------------------
FROM hexpm/elixir:1.19.5-erlang-28.5.0-debian-bookworm-20251229-slim AS runtime

ENV MIX_ENV=prod \
    LANG=C.UTF-8

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates tini curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /repo

COPY --from=build /repo /repo

RUN groupadd --system --gid 1001 niov && \
    useradd --system --uid 1001 --gid niov --home /repo niov && \
    chown -R niov:niov /repo
USER niov

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:4001/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["mix", "run", "--no-halt"]
