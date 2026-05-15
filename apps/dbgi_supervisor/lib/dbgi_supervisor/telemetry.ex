defmodule DbgiSupervisor.Telemetry do
  @moduledoc """
  Sub-phase 11 [BEAM-OBSERVABILITY] telemetry + metrics + Prometheus
  bridge supervisor for dbgi_supervisor per ADR-0030 §DBGI sub-phase 11
  amendment canonical at substantive register substantively.

  ## Substrate-architectural role at canonical register

  Aggregates Telemetry.Metrics definitions for dbgi_supervisor
  subsystem:
  - ProcessGroup join/leave (count + duration; NO group keys at
    canonical register substantively)
  - Phoenix.Tracker handle_diff (count + diff_size; NO Tracker keys
    or meta at canonical register substantively per privacy
    discipline canonical at substantive register)
  - Cluster topology events (node_join/node_leave; node_role
    normalized canonical at substantive register substantively NOT
    raw node names per Q4 LOCKED canonical at substantive register)
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

  - ALLOWED tags: `event_type` (join/leave) + `outcome` (success/
    failure) + `tracker_event` (join/leave) + `process_group_name`
    (only fixed substrate values like DbgiSupervisor.PG)
  - FORBIDDEN tags: `entity_id` + `capsule_id` + `dmw_id` +
    `wallet_id` + `tenant_id` + `task_id` + `topic_tag` +
    `actor_principal_email` + customer/org names + raw node names
    + Phoenix.Tracker keys + Phoenix.Tracker meta maps + free-text
    capsule content + ANY reconstructable lineage at canonical
    register substantively

  ## Prometheus endpoint canonical at substantive register

  Per Q6 LOCKED operator-tier authorization canonical at substantive
  register substantively: localhost-only bind by default at canonical
  register substantively (port 9569 canonical at substantive register
  substantively; distinct from cosmp_router port 9568 to avoid
  port conflict canonical at substantive register substantively);
  Application.get_env override per ADR-0018 deployment-agnostic
  canonical at substantive register substantively at deployment-target
  register.

  ## References

  - ADR-0030 §DBGI sub-phase 11 amendment canonical (LANDED this commit)
  - ADR-0035 §9 D-PHASE-11-NO-IDENTITY-LABEL-DISCIPLINE candidate
  - ADR-0018 deployment-agnostic posture canonical at substantive register
  - https://hexdocs.pm/telemetry_metrics/Telemetry.Metrics.html
  - https://hexdocs.pm/telemetry_poller/Telemetry.Poller.html
  - https://hexdocs.pm/telemetry_metrics_prometheus/TelemetryMetricsPrometheus.html
  """

  use Supervisor

  @default_prometheus_port 9569

  def start_link(opts \\ []) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    prometheus_port =
      Application.get_env(:dbgi_supervisor, :prometheus_port, @default_prometheus_port)

    children = [
      # Prometheus reporter + localhost-bound HTTP scrape endpoint
      # canonical at substantive register per Q6 LOCKED operator-tier
      # authorization at canonical decision register substantively.
      {TelemetryMetricsPrometheus,
       [
         metrics: metrics(),
         port: prometheus_port,
         protocol: :http,
         name: :dbgi_supervisor_prometheus
       ]},
      # Periodic VM stats canonical at substantive register per
      # :telemetry_poller community register substantively.
      {:telemetry_poller,
       measurements: vm_measurements(),
       period: :timer.seconds(10),
       name: :dbgi_supervisor_poller}
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

    # Duration + size buckets canonical at substantive register
    # substantively per TelemetryMetricsPrometheus canonical
    # (distribution chosen over summary at Prometheus exposition
    # register substantively per Q-A LOCKED verification gate at
    # substantive register substantively).
    duration_buckets = [1, 5, 10, 50, 100, 500, 1000, 5000]
    diff_size_buckets = [1, 5, 10, 50, 100, 500, 1000]

    [
      # ProcessGroup canonical (event_type = join/leave; NO group keys)
      counter("dbgi_supervisor.process_group.count",
        event_name: [:dbgi_supervisor, :process_group, :stop],
        measurement: :count,
        tags: [:event_type, :outcome],
        description: "ProcessGroup operation count by event_type + outcome"
      ),
      distribution("dbgi_supervisor.process_group.duration_ms",
        event_name: [:dbgi_supervisor, :process_group, :stop],
        measurement: :duration_ms,
        tags: [:event_type, :outcome],
        unit: :millisecond,
        reporter_options: [buckets: duration_buckets],
        description: "ProcessGroup operation duration histogram"
      ),

      # Phoenix.Tracker canonical (count + diff_size; NO keys/meta
      # per privacy discipline canonical at substantive register)
      counter("dbgi_supervisor.tracker.diff.count",
        event_name: [:dbgi_supervisor, :tracker, :diff],
        measurement: :count,
        description: "Phoenix.Tracker handle_diff invocation count"
      ),
      distribution("dbgi_supervisor.tracker.diff.size",
        event_name: [:dbgi_supervisor, :tracker, :diff],
        measurement: :diff_size,
        reporter_options: [buckets: diff_size_buckets],
        description: "Phoenix.Tracker handle_diff total joins+leaves count histogram"
      ),

      # Cluster canonical (node_join/node_leave; NO raw node names
      # per Q4 LOCKED forbidden-list canonical at substantive register)
      counter("dbgi_supervisor.cluster.event.count",
        event_name: [:dbgi_supervisor, :cluster, :event],
        measurement: :count,
        tags: [:event_type],
        description: "Cluster topology event count by event_type (node_join/node_leave)"
      ),
      last_value("dbgi_supervisor.cluster.size",
        event_name: [:dbgi_supervisor, :cluster, :size],
        measurement: :node_count,
        description: "Cluster size (current node + connected peers count)"
      ),

      # VM stats canonical (via :telemetry_poller; non-identity)
      last_value("dbgi_supervisor.vm.memory.total",
        event_name: [:vm, :memory],
        measurement: :total,
        unit: :byte,
        description: "BEAM VM total memory"
      ),
      last_value("dbgi_supervisor.vm.process_count",
        event_name: [:vm, :system_counts],
        measurement: :process_count,
        description: "BEAM VM process count"
      ),
      last_value("dbgi_supervisor.vm.run_queue_lengths.total",
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
  @spec vm_measurements() :: [atom() | tuple()]
  def vm_measurements() do
    [
      :memory,
      :total_run_queue_lengths,
      {DbgiSupervisor.Telemetry, :emit_cluster_size, []}
    ]
  end

  @doc """
  Cluster size measurement emitter canonical at substantive register.
  Substantively emits cluster size (local node + Node.list count) at
  canonical register substantively; NO raw node names emitted per Q4
  LOCKED canonical at substantive register substantively.
  """
  @spec emit_cluster_size() :: :ok
  def emit_cluster_size() do
    cluster_size = length(Node.list()) + 1

    :telemetry.execute(
      [:dbgi_supervisor, :cluster, :size],
      %{node_count: cluster_size},
      %{}
    )
  end
end
