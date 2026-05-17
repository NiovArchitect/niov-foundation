defmodule DbgiSupervisor.CosmpExecution do
  @moduledoc """
  Behaviour module defining the COSMP op execution interface per
  ADR-0039 Sub-decision 3 substantively at canonical-architectural
  register substantively.

  ## Adapter pattern canonical at Elixir community register

  Substrate-architectural shape canonical per Elixir community
  Adapter Pattern + Ports and Adapters pattern at canonical-
  knowledge register substantively (hexdocs.pm/elixir/typespecs.html
  Behaviours canonical + aaronrenner.io/2023/07/22 production
  adapter pattern reference + dev.to ports-and-adapters reference
  canonical at substrate-architectural register substantively):

  - dbgi_supervisor (DMW substrate infrastructure register) declares
    the COSMP execution interface via @callback canonical at
    canonical-prose register substantively
  - cosmp_router (API edge entrypoint register) implements the
    behaviour via @behaviour declaration on CosmpRouter.Operations
    module canonical at canonical-execution register substantively
  - Runtime configuration via Application.put_env at
    cosmp_router/application.ex boot canonical at canonical-state
    register substantively (cosmp_router registers itself as the
    COSMP executor at startup register substantively)
  - DMWWorker dispatches via DbgiSupervisor.CosmpExecution.adapter/0
    facade canonical at canonical-knowledge register substantively
    which resolves at runtime via Application.get_env

  ## Cycle breakage canonical at canonical-architectural register

  Substrate-coherent unidirectional dependency canonical:

  - cosmp_router -> dbgi_supervisor (compile-time in_umbrella dep
    canonical at canonical-execution register substantively;
    cosmp_router needs DbgiSupervisor.CosmpExecution behaviour
    declaration + DbgiSupervisor.start_dmw_worker_horde/3 +
    Horde.Registry name canonical at substrate-architectural
    register substantively)
  - dbgi_supervisor -> cosmp_router (NO compile-time dep;
    cosmp_router resolved at runtime via Application.get_env
    canonical at canonical-state register substantively; cycle
    broken cleanly canonical at canonical-coherence register
    substantively)

  ## Loose @callback types at canonical-architectural register

  Callback signatures use loose types (struct() / map() / response
  tuple) at canonical-prose register substantively to avoid
  compile-time dependency from dbgi_supervisor on
  CosmpRouter.Proto types. Implementing module (CosmpRouter.Operations)
  refines types via its own @spec declarations canonical at
  canonical-coherence register substantively.

  ## References

  - ADR-0039 Sub-decision 3 (amended at this commit canonical at
    canonical-prose register substantively)
  - ADR-0033 (cross-language data ownership; Q-V parallel-path
    discipline canonical at canonical-knowledge register
    substantively)
  - ADR-0034 (BEAM testability discipline; name-configurable
    substrate; adapter module pattern at testing register
    forward-substrate to mock adapter at unit-test register)
  - ADR-0038 Sub-decisions 1-5 (DMWWorker substrate canonical at
    sub-phase a runtime register substantively)
  - RULE 21 (pre-authorization research arc canonical at canonical-
    knowledge register substantively per 67f6112 commit substantively)
  """

  @typedoc "DMWWorker state at sub-arc 1 sub-phase b register"
  @type state :: %{optional(atom()) => any()}

  @typedoc "COSMP op request canonical at proto3 wire register"
  @type request :: struct() | map()

  @typedoc "COSMP op response canonical at protocol register"
  @type response :: {:ok, struct() | map()} | {:error, struct() | term()}

  @doc "Authenticate COSMP op per ADR-0039 Sub-decision 3 substantively"
  @callback authenticate(request(), state()) :: response()

  @doc "Negotiate COSMP op per ADR-0039 Sub-decision 3 substantively"
  @callback negotiate(request(), state()) :: response()

  @doc "Read COSMP op per ADR-0039 Sub-decision 3 substantively"
  @callback read(request(), state()) :: response()

  @doc "Write COSMP op per ADR-0039 Sub-decision 3 substantively"
  @callback write(request(), state()) :: response()

  @doc "Share COSMP op per ADR-0039 Sub-decision 3 substantively"
  @callback share(request(), state()) :: response()

  @doc "Revoke COSMP op per ADR-0039 Sub-decision 3 substantively"
  @callback revoke(request(), state()) :: response()

  @doc "Audit COSMP op per ADR-0039 Sub-decision 3 substantively"
  @callback audit(request(), state()) :: response()

  @doc """
  Resolve the configured COSMP executor adapter at runtime via
  Application.get_env. Returns the adapter module that implements
  DbgiSupervisor.CosmpExecution behaviour.

  Raises if no adapter is configured (substrate-honest fail-fast
  canonical at canonical-execution register substantively; an
  unconfigured executor at production register substantively is a
  substrate-architectural error not silently-recoverable at canonical-
  coherence register substantively).
  """
  @spec adapter() :: module()
  def adapter do
    Application.get_env(:dbgi_supervisor, :cosmp_executor) ||
      raise """
      DbgiSupervisor.CosmpExecution adapter not configured.

      Application.put_env(:dbgi_supervisor, :cosmp_executor, AdapterModule) \
      must fire at application boot register per RULE 21 \
      D-PRE-AUTHORIZATION-RESEARCH-ARC discipline.

      Canonical configuration site: apps/cosmp_router/lib/cosmp_router/\
      application.ex start/2 callback registers CosmpRouter.Operations as \
      the canonical adapter per [BEAM-COSMP-HIVE-DISPATCH-INTEGRATION] \
      commit.
      """
  end
end
