# FILE: config/config.exs
# PURPOSE: Umbrella-level configuration root. Loaded for all environments
#          before env-specific config imports at the bottom.
# CONNECTS TO:
#   docs/architecture/decisions/0030-phase-2-elixir-beam-implementation.md
#     (§Implementation Detail mix umbrella workspace structure).
#   config/{dev,prod,test}.exs (env-specific configs imported at end).
# WHY: Sub-phase 2 [BEAM-MIX-WORKSPACE] minimal scaffold. Sub-phases
#      3-10 of the Block B mini-arc populate as apps and their config
#      requirements land.

import Config

# Sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] per ADR-0033:
# register CosmpRouter.Repo as the canonical Ecto repo for the
# cosmp_router OTP app. Per-env connection details land in
# config/{dev,test,runtime}.exs.
config :cosmp_router, ecto_repos: [CosmpRouter.Repo]

# Sub-phase 9 [BEAM-DBGI-LIBCLUSTER] per ADR-0028 §3 + ADR-0030 §DBGI
# canonical: empty topology default at umbrella-level register;
# deployment-target-specific topology configurable via
# Application.get_env(:libcluster, :topologies) override at deploy-time
# register per ADR-0018 deployment-agnostic canonical at substrate-
# architectural register. Cluster.Strategy.Epmd canonical at local-dev
# + test register; Cluster.Strategy.Gossip / Kubernetes / DNS at
# production deployment-target register substantively configurable per
# operator-deploy register.
config :libcluster,
  topologies: []

# Sub-phase 11 [BEAM-OBSERVABILITY] structured JSON logging canonical
# at substantive register substantively per ADR-0030 §DBGI sub-phase 11
# amendment + Q5 LOCKED operator-tier authorization canonical at
# substantive register (analogous to TS pino canonical per
# STRUCTURED_LOGGING_SCHEMA.md substantive register; SIEM-friendly at
# canonical register substantively at substantive register).
#
# Privacy + cardinality discipline canonical at substantive register
# per Q4 LOCKED + D-PHASE-11-NO-IDENTITY-LABEL-DISCIPLINE substrate-
# build observation candidate canonical at substantive register
# substantively at substantive register: formatter metadata strictly
# allow-listed canonical at substantive register substantively;
# substantively NO identity-bearing keys (entity_id / capsule_id /
# dmw_id / wallet_id / tenant_id / task_id / topic_tag /
# actor_principal_email / customer_name / org names / raw node names
# / Phoenix.Tracker keys / Phoenix.Tracker meta maps / free-text
# capsule content) at canonical register substantively.
#
# Allow-listed metadata canonical at substantive register: app +
# component + op_name + status_class + storage_op + tracker_event +
# event_type + outcome + duration_ms + node_role. Passed to the
# `:logger_json` Basic formatter at `:default_handler` register
# canonical at substantive register substantively (Elixir 1.19+
# canonical: per-handler formatter args; NOT top-level
# `config :logger, metadata: [...]` register at substantive register
# substantively per Elixir 1.19+ new-logger discipline canonical at
# substantive register substantively).
config :logger,
  level: :info

# :logger_json formatter canonical at substantive register per Q5
# LOCKED canonical at substantive register substantively. Basic
# formatter substantively SIEM-friendly at canonical register
# substantively (Datadog / ElasticSearch / Google Cloud Logging /
# Splunk substantively at substantive register). Metadata allow-list
# canonical at substantive register substantively passed via
# formatter args per Elixir 1.19+ new-logger discipline canonical
# at substantive register substantively.
config :logger, :default_handler,
  formatter:
    {LoggerJSON.Formatters.Basic,
     metadata: [
       :app,
       :component,
       :op_name,
       :status_class,
       :storage_op,
       :tracker_event,
       :event_type,
       :outcome,
       :duration_ms,
       :node_role
     ]}

# Import env-specific config at the end (canonical Elixir pattern;
# allows env-specific overrides of any umbrella-level config above).
import_config "#{config_env()}.exs"
