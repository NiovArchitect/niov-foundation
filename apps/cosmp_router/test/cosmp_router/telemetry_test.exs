defmodule CosmpRouter.TelemetryTest do
  @moduledoc """
  Sub-phase 11 [BEAM-OBSERVABILITY] telemetry + metrics unit tests
  per ADR-0030 §DBGI sub-phase 11 amendment canonical at substantive
  register substantively per Q7 LOCKED operator-tier authorization
  at canonical decision register substantively.

  Tests verify Telemetry.Metrics definitions registration + privacy-
  discipline label allow-list canonical at substantive register
  substantively per Q4 LOCKED canonical at substantive register
  substantively at substantive register. NO COSMP-op telemetry
  emission tests here — those require GenServer Router instance +
  Postgres + ETS substrate canonical at substantive register
  substantively (integration tier scope at substantive register
  substantively; forward-queued canonical at substantive register
  substantively).

  ## References

  - ADR-0030 §DBGI sub-phase 11 amendment (LANDED this commit)
  - ADR-0035 §9 D-PHASE-11-NO-IDENTITY-LABEL-DISCIPLINE candidate
  """

  use ExUnit.Case, async: false

  alias CosmpRouter.Telemetry

  describe "Telemetry.Metrics definitions canonical at substantive register" do
    test "metrics/0 returns canonical Telemetry.Metrics definitions" do
      metrics = Telemetry.metrics()

      assert is_list(metrics)
      assert length(metrics) > 0

      Enum.each(metrics, fn metric ->
        assert is_struct(metric)
      end)
    end

    test "COSMP op metrics canonical at substantive register" do
      metrics = Telemetry.metrics()
      names = Enum.map(metrics, & &1.name)

      assert [:cosmp_router, :op, :stop, :count] in names
      assert [:cosmp_router, :op, :stop, :duration_ms] in names
      assert [:cosmp_router, :op, :exception, :count] in names
    end

    test "storage metrics canonical at substantive register" do
      metrics = Telemetry.metrics()
      names = Enum.map(metrics, & &1.name)

      assert [:cosmp_router, :storage, :count] in names
      assert [:cosmp_router, :storage, :duration_ms] in names
    end

    test "audit + idempotency metrics canonical at substantive register" do
      metrics = Telemetry.metrics()
      names = Enum.map(metrics, & &1.name)

      assert [:cosmp_router, :audit, :write, :count] in names
      assert [:cosmp_router, :audit, :write, :duration_ms] in names
      assert [:cosmp_router, :idempotency, :count] in names
    end

    test "vm stats metrics canonical at substantive register" do
      metrics = Telemetry.metrics()
      names = Enum.map(metrics, & &1.name)

      assert [:cosmp_router, :vm, :memory, :total] in names
      assert [:cosmp_router, :vm, :process_count] in names
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
      :node,
      :principal_id,
      :grantee,
      :target_capsule_id
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

      allowed = [
        :op_name,
        :status_class,
        :exception_class,
        :storage_op,
        :outcome,
        :tracker_event,
        :event_type,
        :app,
        :component
      ]

      Enum.each(all_tags, fn tag ->
        assert tag in allowed,
               "Tag #{inspect(tag)} substantively NOT in canonical allow-list at substantive register"
      end)
    end
  end

  describe "instrument_op canonical at substantive register" do
    # `:telemetry.execute` substantively SYNCHRONOUS in caller process
    # at canonical register substantively (NOT mailbox-fragile per
    # D-PHASE-10-CI-PRESENCE-TRACKER-TIMING-CASCADE substantively per
    # operator-tier locked canonical at substantive register).
    #
    # Verifies the `:telemetry.span` canonical emits :start + :stop
    # events with op_name + status_class metadata canonical at
    # substantive register substantively per Q4 LOCKED canonical at
    # substantive register substantively.

    setup do
      ref = make_ref()
      test_pid = self()
      handler_id = {__MODULE__, ref}

      :ok =
        :telemetry.attach_many(
          handler_id,
          [
            [:cosmp_router, :op, :start],
            [:cosmp_router, :op, :stop]
          ],
          fn event, measurements, metadata, _config ->
            send(test_pid, {:telemetry, ref, event, measurements, metadata})
          end,
          nil
        )

      on_exit(fn -> :telemetry.detach(handler_id) end)
      {:ok, ref: ref}
    end

    test "Telemetry.span emits :start + :stop events for COSMP op canonical", %{ref: ref} do
      # Substantively simulate the instrument_op wrapper canonical at
      # substantive register without invoking the full Router GenServer
      # (which substantively requires Postgres + ETS substrate at
      # substantive register canonical at substantive register).
      result =
        :telemetry.span(
          [:cosmp_router, :op],
          %{op_name: :read},
          fn ->
            {{:reply, {:ok, :test_result}, %{}},
             %{op_name: :read, status_class: :ok}}
          end
        )

      assert {:reply, {:ok, :test_result}, %{}} = result

      assert_receive {:telemetry, ^ref, [:cosmp_router, :op, :start], _measurements,
                      start_meta},
                     1000

      assert start_meta.op_name == :read

      assert_receive {:telemetry, ^ref, [:cosmp_router, :op, :stop], measurements,
                      stop_meta},
                     1000

      assert is_integer(measurements.duration)
      assert measurements.duration >= 0
      assert stop_meta.op_name == :read
      assert stop_meta.status_class == :ok
    end
  end
end
