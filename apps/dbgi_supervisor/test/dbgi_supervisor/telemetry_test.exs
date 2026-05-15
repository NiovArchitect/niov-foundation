defmodule DbgiSupervisor.TelemetryTest do
  @moduledoc """
  Sub-phase 11 [BEAM-OBSERVABILITY] telemetry + metrics unit tests
  per ADR-0030 §DBGI sub-phase 11 amendment canonical at substantive
  register substantively per Q7 LOCKED operator-tier authorization
  at canonical decision register substantively.

  Tests verify telemetry event emission (synchronous in caller per
  `:telemetry.execute` canonical at substantive register; NOT
  mailbox-fragile per D-PHASE-10-CI-PRESENCE-TRACKER-TIMING-CASCADE
  substrate-build observation candidate canonical at substantive
  register substantively) + Telemetry.Metrics definitions registration
  + privacy-discipline label allow-list canonical at substantive
  register substantively per Q4 LOCKED canonical at substantive
  register substantively at substantive register.

  ## References

  - ADR-0030 §DBGI sub-phase 11 amendment (LANDED this commit)
  - ADR-0035 §9 D-PHASE-11-NO-IDENTITY-LABEL-DISCIPLINE candidate
  """

  use ExUnit.Case, async: false

  alias DbgiSupervisor.{ProcessGroup, Telemetry}

  describe "Telemetry.Metrics definitions canonical at substantive register" do
    test "metrics/0 returns canonical Telemetry.Metrics definitions" do
      metrics = Telemetry.metrics()

      assert is_list(metrics)
      assert length(metrics) > 0

      Enum.each(metrics, fn metric ->
        assert is_struct(metric)
      end)
    end

    test "process_group metrics canonical at substantive register" do
      metrics = Telemetry.metrics()
      names = Enum.map(metrics, & &1.name)

      assert [:dbgi_supervisor, :process_group, :count] in names
      assert [:dbgi_supervisor, :process_group, :duration_ms] in names
    end

    test "tracker diff metrics canonical at substantive register" do
      metrics = Telemetry.metrics()
      names = Enum.map(metrics, & &1.name)

      assert [:dbgi_supervisor, :tracker, :diff, :count] in names
      assert [:dbgi_supervisor, :tracker, :diff, :size] in names
    end

    test "cluster metrics canonical at substantive register" do
      metrics = Telemetry.metrics()
      names = Enum.map(metrics, & &1.name)

      assert [:dbgi_supervisor, :cluster, :event, :count] in names
      assert [:dbgi_supervisor, :cluster, :size] in names
    end

    test "vm stats metrics canonical at substantive register" do
      metrics = Telemetry.metrics()
      names = Enum.map(metrics, & &1.name)

      assert [:dbgi_supervisor, :vm, :memory, :total] in names
      assert [:dbgi_supervisor, :vm, :process_count] in names
    end
  end

  describe "Telemetry.Metrics tags privacy discipline canonical" do
    # D-PHASE-11-NO-IDENTITY-LABEL-DISCIPLINE substrate-build
    # observation candidate canonical at substantive register
    # substantively at substantive register: ALL metric tags
    # substantively constrained to LOW-CARDINALITY + NON-IDENTITY-
    # BEARING values canonical at substantive register substantively.

    @forbidden_tags [
      :entity_id,
      :capsule_id,
      :dmw_id,
      :wallet_id,
      :tenant_id,
      :task_id,
      :topic_tag,
      :actor_principal_email,
      :customer_name,
      :org_name,
      :hostname,
      :ip_address,
      :request_id,
      :tracker_key,
      :tracker_meta,
      :pg_member_id,
      :document_name,
      :file_path,
      :node
    ]

    test "NO metric tag includes any forbidden identity-bearing label canonical" do
      metrics = Telemetry.metrics()

      all_tags =
        metrics
        |> Enum.flat_map(fn metric -> Map.get(metric, :tags, []) end)
        |> Enum.uniq()

      forbidden_present =
        Enum.filter(all_tags, fn tag -> tag in @forbidden_tags end)

      assert forbidden_present == [],
             "FORBIDDEN identity-bearing tags substantively detected at canonical register: #{inspect(forbidden_present)}"
    end

    test "allowed tags canonical at substantive register" do
      metrics = Telemetry.metrics()

      all_tags =
        metrics
        |> Enum.flat_map(fn metric -> Map.get(metric, :tags, []) end)
        |> Enum.uniq()

      allowed = [:event_type, :outcome, :status_class, :tracker_event, :app, :component]

      Enum.each(all_tags, fn tag ->
        assert tag in allowed,
               "Tag #{inspect(tag)} substantively NOT in canonical allow-list at substantive register"
      end)
    end
  end

  describe "ProcessGroup telemetry emission canonical at substantive register" do
    # `:telemetry.execute` substantively SYNCHRONOUS in caller process
    # at canonical register substantively (NOT mailbox-fragile per
    # D-PHASE-10-CI-PRESENCE-TRACKER-TIMING-CASCADE substantively per
    # operator-tier locked canonical at substantive register).

    setup do
      ref = make_ref()
      test_pid = self()

      handler_id = {__MODULE__, ref}

      :ok =
        :telemetry.attach(
          handler_id,
          [:dbgi_supervisor, :process_group, :stop],
          fn _event, measurements, metadata, _config ->
            send(test_pid, {:telemetry, ref, measurements, metadata})
          end,
          nil
        )

      on_exit(fn -> :telemetry.detach(handler_id) end)

      {:ok, ref: ref}
    end

    test "ProcessGroup.join emits canonical telemetry event", %{ref: ref} do
      group = :"test_group_#{System.unique_integer([:positive])}"

      :ok = ProcessGroup.join(group)

      assert_receive {:telemetry, ^ref, measurements, metadata}, 1000
      assert is_integer(measurements.count)
      assert is_integer(measurements.duration_ms)
      assert measurements.duration_ms >= 0
      assert metadata.event_type == :join
      assert metadata.outcome == :success
    end

    test "ProcessGroup.leave emits canonical telemetry event", %{ref: ref} do
      group = :"test_group_#{System.unique_integer([:positive])}"
      :ok = ProcessGroup.join(group)
      # Drain the join event from the mailbox
      assert_receive {:telemetry, ^ref, _, _}, 1000

      :ok = ProcessGroup.leave(group)

      assert_receive {:telemetry, ^ref, measurements, metadata}, 1000
      assert is_integer(measurements.count)
      assert metadata.event_type == :leave
      assert metadata.outcome in [:success, :failure]
    end

    test "ProcessGroup telemetry metadata canonical NO identity-bearing keys", %{ref: ref} do
      group = :"identity_test_#{System.unique_integer([:positive])}"

      :ok = ProcessGroup.join(group)

      assert_receive {:telemetry, ^ref, _measurements, metadata}, 1000

      # Verify metadata substantively contains ONLY allowed keys at
      # canonical register substantively per Q4 LOCKED + D-PHASE-11-
      # NO-IDENTITY-LABEL-DISCIPLINE canonical at substantive register
      allowed_keys = [:event_type, :outcome]
      metadata_keys = Map.keys(metadata)

      Enum.each(metadata_keys, fn key ->
        assert key in allowed_keys,
               "FORBIDDEN metadata key substantively detected at canonical register: #{inspect(key)}"
      end)
    end
  end

  describe "cluster size emitter canonical at substantive register" do
    setup do
      ref = make_ref()
      test_pid = self()
      handler_id = {__MODULE__, ref}

      :ok =
        :telemetry.attach(
          handler_id,
          [:dbgi_supervisor, :cluster, :size],
          fn _event, measurements, metadata, _config ->
            send(test_pid, {:telemetry, ref, measurements, metadata})
          end,
          nil
        )

      on_exit(fn -> :telemetry.detach(handler_id) end)
      {:ok, ref: ref}
    end

    test "emit_cluster_size emits node_count canonical without raw node names", %{ref: ref} do
      :ok = Telemetry.emit_cluster_size()

      assert_receive {:telemetry, ^ref, measurements, metadata}, 1000
      assert is_integer(measurements.node_count)
      assert measurements.node_count >= 1

      # Verify metadata canonical at substantive register substantively
      # — NO raw node names emitted per Q4 LOCKED canonical at
      # substantive register substantively.
      assert metadata == %{}
    end
  end
end
