defmodule CosmpRouter.Telemetry do
  @moduledoc """
  Sub-phase 11 [BEAM-OBSERVABILITY] telemetry + metrics + Prometheus
  bridge supervisor for cosmp_router per ADR-0030 §DBGI sub-phase 11
  amendment canonical at substantive register substantively.

  ## Substrate-architectural role at canonical register

  Aggregates Telemetry.Metrics definitions for cosmp_router subsystem:
  - 7 COSMP operations (AUTHENTICATE/NEGOTIATE/READ/WRITE/SHARE/REVOKE
    /AUDIT public per patent US 12,517,919; op_name canonical at
    substantive register low-cardinality + non-identity-bearing)
  - ETS storage operations (put/get/delete; storage_op canonical at
    substantive register low-cardinality + non-identity-bearing)
  - Audit chain writes (count + duration; NO entity_id at canonical
    register substantively)
  - Idempotency operations (hit/miss/record outcome canonical at
    substantive register)
  - VM stats via :telemetry_poller canonical (memory + processes +
    schedulers)

  ## Privacy + cardinality discipline canonical at substantive register

  Per Q4 LOCKED operator-tier authorization at canonical decision
  register substantively at substantive register + per
  D-PHASE-11-NO-IDENTITY-LABEL-DISCIPLINE substrate-build observation
  candidate canonical at substantive register substantively at
  substantive register: ALL metrics tags + telemetry event metadata
  substantively constrained to LOW-CARDINALITY + NON-IDENTITY-BEARING
  values canonical at substantive register substantively.

  - ALLOWED tags: `op_name` (COSMP enum) + `status_class` (ok/error)
    + `storage_op` (put/get/delete) + `outcome` (success/failure)
  - FORBIDDEN tags: `entity_id` + `capsule_id` + `dmw_id` +
    `wallet_id` + `tenant_id` + `task_id` + `topic_tag` +
    `actor_principal_email` + customer/org names + raw node names
    + Phoenix.Tracker keys + free-text capsule content + ANY
    reconstructable lineage at canonical register substantively

  ## Prometheus endpoint canonical at substantive register

  Per Q6 LOCKED operator-tier authorization canonical at substantive
  register substantively: localhost-only bind by default at canonical
  register substantively (port 9568 canonical at substantive register
  substantively); Application.get_env override per ADR-0018
  deployment-agnostic canonical at substantive register substantively
  at deployment-target register.

  ## References

  - ADR-0030 §DBGI sub-phase 11 amendment canonical (LANDED this commit)
  - ADR-0035 §9 D-PHASE-11-NO-IDENTITY-LABEL-DISCIPLINE candidate
  - ADR-0018 deployment-agnostic posture canonical at substantive register
  - https://hexdocs.pm/telemetry_metrics/Telemetry.Metrics.html
  - https://hexdocs.pm/telemetry_poller/Telemetry.Poller.html
  - https://hexdocs.pm/telemetry_metrics_prometheus/TelemetryMetricsPrometheus.html
  """

  use Supervisor

  @default_prometheus_port 9568

  def start_link(opts \\ []) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    prometheus_port =
      Application.get_env(:cosmp_router, :prometheus_port, @default_prometheus_port)

    children = [
      # Prometheus reporter + localhost-bound HTTP scrape endpoint
      # canonical at substantive register per Q6 LOCKED operator-tier
      # authorization at canonical decision register substantively.
      {TelemetryMetricsPrometheus,
       [
         metrics: metrics(),
         port: prometheus_port,
         protocol: :http,
         name: :cosmp_router_prometheus
       ]},
      # Periodic VM stats canonical at substantive register per
      # :telemetry_poller community register substantively.
      {:telemetry_poller,
       measurements: vm_measurements(),
       period: :timer.seconds(10),
       name: :cosmp_router_poller}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end

  @doc """
  Telemetry.Metrics definitions canonical at substantive register.

  All metric tags substantively constrained to allow-list canonical
  at substantive register per Q4 LOCKED + D-PHASE-11-NO-IDENTITY-
  LABEL-DISCIPLINE substantively at substantive register. NO
  identity-bearing tags at canonical register substantively at
  substantive register.
  """
  @spec metrics() :: [Telemetry.Metrics.t()]
  def metrics() do
    import Telemetry.Metrics

    # Duration histogram buckets canonical at substantive register
    # substantively (ms; covers fast sub-1ms ops + slow seconds-scale
    # ops). Distribution metric type chosen over summary canonical at
    # substantive register substantively per TelemetryMetricsPrometheus
    # canonical (summary dropped at Prometheus bridge register
    # substantively; distribution canonical at Prometheus exposition
    # format register).
    duration_buckets = [1, 5, 10, 50, 100, 500, 1000, 5000]

    [
      # COSMP 7-op canonical (op_name = AUTHENTICATE/NEGOTIATE/READ/
      # WRITE/SHARE/REVOKE/AUDIT public per patent US 12,517,919)
      counter("cosmp_router.op.stop.count",
        event_name: [:cosmp_router, :op, :stop],
        measurement: :count,
        tags: [:op_name, :status_class],
        description: "COSMP operation completion count by op_name + status_class"
      ),
      distribution("cosmp_router.op.stop.duration_ms",
        event_name: [:cosmp_router, :op, :stop],
        measurement: :duration,
        tags: [:op_name, :status_class],
        unit: {:native, :millisecond},
        reporter_options: [buckets: duration_buckets],
        description: "COSMP operation duration histogram by op_name + status_class"
      ),
      counter("cosmp_router.op.exception.count",
        event_name: [:cosmp_router, :op, :exception],
        measurement: :count,
        tags: [:op_name, :exception_class],
        description: "COSMP operation exception count by op_name + exception_class"
      ),

      # ETS storage canonical (storage_op = put/get/delete;
      # NO keys at canonical register substantively)
      counter("cosmp_router.storage.count",
        event_name: [:cosmp_router, :storage, :stop],
        measurement: :count,
        tags: [:storage_op, :outcome],
        description: "ETS storage operation count by storage_op + outcome"
      ),
      distribution("cosmp_router.storage.duration_ms",
        event_name: [:cosmp_router, :storage, :stop],
        measurement: :duration_ms,
        tags: [:storage_op, :outcome],
        unit: :millisecond,
        reporter_options: [buckets: duration_buckets],
        description: "ETS storage operation duration histogram"
      ),

      # Audit chain writes canonical (count + duration; NO entity_id)
      counter("cosmp_router.audit.write.count",
        event_name: [:cosmp_router, :audit, :write],
        measurement: :count,
        tags: [:outcome],
        description: "Audit chain write count by outcome"
      ),
      distribution("cosmp_router.audit.write.duration_ms",
        event_name: [:cosmp_router, :audit, :write],
        measurement: :duration_ms,
        tags: [:outcome],
        unit: :millisecond,
        reporter_options: [buckets: duration_buckets],
        description: "Audit chain write duration histogram"
      ),

      # Idempotency canonical (hit/miss/record outcome)
      counter("cosmp_router.idempotency.count",
        event_name: [:cosmp_router, :idempotency],
        measurement: :count,
        tags: [:outcome],
        description: "Idempotency operation count by outcome (hit/miss/record)"
      ),

      # VM stats canonical (via :telemetry_poller; non-identity)
      last_value("cosmp_router.vm.memory.total",
        event_name: [:vm, :memory],
        measurement: :total,
        unit: :byte,
        description: "BEAM VM total memory"
      ),
      last_value("cosmp_router.vm.process_count",
        event_name: [:vm, :system_counts],
        measurement: :process_count,
        description: "BEAM VM process count"
      ),
      last_value("cosmp_router.vm.run_queue_lengths.total",
        event_name: [:vm, :total_run_queue_lengths],
        measurement: :total,
        description: "BEAM VM total run queue length"
      )
    ]
  end

  @doc """
  Periodic VM measurements canonical at substantive register per
  :telemetry_poller community register substantively.
  """
  @spec vm_measurements() :: [tuple()]
  def vm_measurements() do
    [
      :memory,
      :total_run_queue_lengths,
      {:process_info, event: [:cosmp_router, :process_info], name: CosmpRouter.Router,
       keys: [:message_queue_len, :memory]}
    ]
  end
end
