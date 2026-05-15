defmodule DbgiSupervisor.ClusterHelpers do
  @moduledoc """
  Multi-node cluster test helpers for sub-phase 10
  `[BEAM-DBGI-INTEGRATION-TESTS]` per ADR-0030 §DBGI canonical at
  substrate-architectural register.

  Provides `:peer`-based peer node lifecycle canonical at OTP-native
  minimal-dep register per D-PHASE-10-PEER-VS-LOCAL-CLUSTER-
  DISCRIMINATION 31st canonical substrate-build observation
  (substantively analogous to D-PHASE-8-PG-VS-GPROC-DISCRIMINATION
  21st pattern at sub-phase 8 register).

  ## Canonical API at substantive register

  - `ensure_distributed!/0` — start parent node distribution (idempotent;
    `:longnames` canonical at substantive register; cookie set)
  - `start_peer!/1` — spin up a peer node, propagate code paths via
    `-pa`, start `:dbgi_supervisor` app on peer, connect parent ↔ peer
  - `stop_peer!/1` — clean shutdown via `:peer.stop/1`

  ## D-PHASE-10-MULTI-NODE-TEST-RUNTIME-BUDGET 30th canonical

  Phoenix.Tracker `:broadcast_period` default 1500ms; `:down_period`
  default 30s. Multi-node tests substantively wait for CRDT replication
  per substrate-honest production-coherence register (Q3 Option α
  LOCKED at sub-phase 10 canonical decision register). `:peer`
  `wait_boot` set to 30_000ms canonical (default 15_000ms substantively
  insufficient at substantive register for full app-tree boot).

  ## D-PHASE-10-PARTITION-SURVIVAL-CANONICAL 33rd canonical

  RQ1 verbatim OTP canonical at substantive register: `:peer.start_link`
  with `connection: 0` (alternative TCP control channel; auto-port)
  + `peer_down: :continue` substantively keeps the controlling
  process + peer node alive across `Node.disconnect/1` partition
  simulation at canonical register. Default `:peer.start_link/1`
  uses Distributed Erlang as control channel substantively; default
  `peer_down: :stop` substantively terminates controlling process
  on connection loss at canonical register — surfaced at substrate-
  state register as D-PHASE-10-DISCONNECT-TEST-CASCADE 32nd canonical
  (sub-phase 10 substrate-build register substantively).

  Canonical helpers at substantive register:

  - `start_peer!/1` — standard partition-naive peer at canonical
    register (uses Distributed Erlang control channel canonical;
    `peer_down: :stop` default canonical at substantive register;
    suitable for non-partition multi-node tests at canonical register)
  - `start_partition_survival_peer!/1` — partition-survival peer
    canonical at substantive register per RQ1 verbatim OTP canonical
    (`connection: 0` + `peer_down: :continue` canonical); suitable
    for partition simulation tests at canonical register

  ## RQ1-RQ4 canonical-coherence verification register

  Sub-phase 10 substrate-build register substantively cites broader-
  community canonical at canonical-coherence verification register:

  - RQ1 (`:peer` lifecycle canonical at OTP register): verbatim OTP
    canonical at https://www.erlang.org/doc/man/peer.html (`connection`
    + `peer_down` options canonical at substantive register)
  - RQ2 (Phoenix.Tracker partition recovery canonical): hexdocs at
    https://hexdocs.pm/phoenix_pubsub/Phoenix.Tracker.html
    insufficient at substantive register; source-knowledge canonical
    applied at substantive register (ORSWOT CRDT auto-merge via
    heartbeat exchange post-reconnect at canonical register;
    `@recovery_wait_ms 5000` = 3× `:broadcast_period` substantively
    conservative at substantive register)
  - RQ3 (`:pg` cross-node membership under partition canonical at
    OTP register): verbatim OTP canonical at
    https://www.erlang.org/doc/man/pg.html — "Membership view is
    not transitive. If `node1` is not directly connected to `node2`,
    they will not see each other's groups." Source-knowledge
    canonical applied at substantive register (`:pg` substantively
    re-replicates via heartbeat post-`Node.connect` canonical;
    convergence typically <500ms small clusters at substantive
    register)
  - RQ4 (ExUnit multi-node partition test canonical at Elixir
    community register): per-file isolation canonical at substrate-
    coherent register (separate test file with own setup_all peer
    canonical at substantive register; substantively prevents
    cascade to other tests at canonical register); cf. Elixir Forum
    libcluster threads + Toran Billups multi-node ExUnit pattern
    canonical at community register

  ## References

  - ADR-0028 §3 (BEAM Coordination Layer — multi-region clustering)
  - ADR-0030 §DBGI sub-phase 10 (LANDED this commit per
    D-PHASE-9-PHOENIX-TRACKER-ADR-0030-AMENDMENT-CANDIDATE 27th
    + sub-phase 10 amendment pattern at substantive register)
  - ADR-0034 (testability discipline; `test/support` helper module
    canonical at substrate-coherent register; `elixirc_paths(:test)`
    canonical at sub-phase 6a register)
  - ADR-0035 §9 (D-PHASE-10-MULTI-NODE-TEST-RUNTIME-BUDGET 30th +
    D-PHASE-10-PEER-VS-LOCAL-CLUSTER-DISCRIMINATION 31st +
    D-PHASE-10-DISCONNECT-TEST-CASCADE 32nd +
    D-PHASE-10-PARTITION-SURVIVAL-CANONICAL 33rd canonicals)
  - https://www.erlang.org/doc/man/peer.html (RQ1)
  - https://hexdocs.pm/phoenix_pubsub/Phoenix.Tracker.html (RQ2)
  - https://www.erlang.org/doc/man/pg.html (RQ3)
  - https://hexdocs.pm/elixir/Node.html
  """

  # Phoenix.Tracker post-reconnect CRDT re-merge wait budget canonical
  # at substantive register per RQ2 source-knowledge canonical: 3×
  # `:broadcast_period` (1500ms) substantively conservative for short-
  # partition CRDT settling at canonical register substantively.
  @recovery_wait_ms 5000

  @cookie :niov_dbgi_test_cookie
  @parent_node :"dbgi_primary@127.0.0.1"

  @doc """
  Start parent node distribution canonical at substantive register
  (idempotent — safe to call multiple times). `:longnames` canonical
  per `:peer` longnames substantive coherence requirement at
  canonical-pattern register. Substantively ensures `epmd` daemon
  is running first canonical at substantive register (Node.start
  fails with `:nodistribution` if epmd absent — surfaced as substrate-
  state observation at sub-phase 10 substrate-build register).
  """
  @spec ensure_distributed!() :: :ok
  def ensure_distributed!() do
    unless Node.alive?() do
      ensure_epmd!()
      {:ok, _pid} = Node.start(@parent_node, :longnames)
    end

    Node.set_cookie(Node.self(), @cookie)
    :ok
  end

  # Start epmd as daemon canonical at substantive register if not
  # already running. `:os.cmd/1` substantively idempotent at canonical
  # register — epmd silently noops if already running at substantive
  # register.
  @spec ensure_epmd!() :: :ok
  defp ensure_epmd!() do
    _ = :os.cmd(~c"epmd -daemon")
    :ok
  end

  @doc """
  Start a peer node canonical at substantive register.

  Returns `{peer_server_ref, peer_node_atom}` tuple. Peer node has
  `:dbgi_supervisor` app started + cookie set + connected to parent
  at canonical register. `start_link` canonical per `:peer` register
  (peer process linked to caller; auto-cleanup on caller termination).
  """
  @spec start_peer!(atom()) :: {pid(), node()}
  def start_peer!(name_atom) when is_atom(name_atom) do
    ensure_distributed!()

    code_paths_args =
      :code.get_path()
      |> Enum.flat_map(fn path -> [~c"-pa", path] end)

    cookie_args = [~c"-setcookie", Atom.to_charlist(@cookie)]

    {:ok, peer, node} =
      :peer.start_link(%{
        name: name_atom,
        host: ~c"127.0.0.1",
        longnames: true,
        args: cookie_args ++ code_paths_args,
        wait_boot: 30_000
      })

    # Connect parent ↔ peer canonical at distributed Erlang register
    # FIRST — establishes Distributed Erlang channel for `:rpc.call`
    # canonical at substantive register. `:peer.call` substantively
    # uses an alternative TCP connection that may surface
    # `:noconnection` at canonical-pattern register; `:rpc.call`
    # canonical at Distributed Erlang register substantively works
    # post-Node.connect canonical at substantive register.
    true = Node.connect(node)

    # Set libcluster topology to empty on peer (matches parent's
    # config/config.exs umbrella default per sub-phase 9 canonical;
    # tests connect manually via Node.connect rather than depending
    # on libcluster discovery at substantive register).
    :ok = :rpc.call(node, Application, :put_env, [:libcluster, :topologies, []])

    # Start :dbgi_supervisor app + dependencies on peer canonical
    # at substantive register. ensure_all_started returns
    # {:ok, [started_apps]} per OTP canonical.
    {:ok, _started} = :rpc.call(node, Application, :ensure_all_started, [:dbgi_supervisor])

    {peer, node}
  end

  @doc """
  Start a partition-survival peer node canonical at substantive
  register per RQ1 verbatim OTP canonical. Uses `connection: 0`
  (alternative TCP control channel; auto-port) + `peer_down: :continue`
  canonical at substantive register so the peer + controlling process
  substantively survive `Node.disconnect/1` partition simulation at
  canonical register (Distributed Erlang severed; alternative TCP
  channel substantively independent at canonical register).

  Returns `{peer_server_ref, peer_node_atom}` tuple. Peer node has
  `:dbgi_supervisor` app started + cookie set + connected to parent
  at canonical register (parent ↔ peer Distributed Erlang
  re-establishable via `Node.connect/1` post-partition canonical at
  substantive register).
  """
  @spec start_partition_survival_peer!(atom()) :: {pid(), node()}
  def start_partition_survival_peer!(name_atom) when is_atom(name_atom) do
    ensure_distributed!()

    code_paths_args =
      :code.get_path()
      |> Enum.flat_map(fn path -> [~c"-pa", path] end)

    cookie_args = [~c"-setcookie", Atom.to_charlist(@cookie)]

    {:ok, peer, node} =
      :peer.start_link(%{
        name: name_atom,
        host: ~c"127.0.0.1",
        longnames: true,
        # RQ1 verbatim OTP canonical at substantive register:
        # `connection: 0` substantively uses alternative TCP control
        # channel (auto-port) instead of Distributed Erlang canonical;
        # `peer_down: :continue` substantively keeps controlling
        # process alive on connection loss canonical at substantive
        # register (default `:stop` substantively cascades per
        # D-PHASE-10-DISCONNECT-TEST-CASCADE 32nd canonical).
        connection: 0,
        peer_down: :continue,
        args: cookie_args ++ code_paths_args,
        wait_boot: 30_000
      })

    # Connect parent ↔ peer canonical at Distributed Erlang register
    # (separate from alternative TCP control channel above; substantively
    # independent at substantive register per RQ1 verbatim OTP canonical).
    true = Node.connect(node)

    # Set libcluster topology to empty on peer (matches parent's
    # config/config.exs umbrella default canonical at substantive
    # register).
    :ok = :rpc.call(node, Application, :put_env, [:libcluster, :topologies, []])

    # Start :dbgi_supervisor app + dependencies on peer canonical
    # at substantive register.
    {:ok, _started} = :rpc.call(node, Application, :ensure_all_started, [:dbgi_supervisor])

    {peer, node}
  end

  @doc """
  Phoenix.Tracker post-reconnect CRDT re-merge wait budget canonical
  at substantive register per RQ2 source-knowledge canonical
  (3× `:broadcast_period` substantively conservative).
  """
  @spec recovery_wait_ms() :: pos_integer()
  def recovery_wait_ms(), do: @recovery_wait_ms

  @doc """
  Stop a peer node canonical at substantive register. Tolerant of
  already-stopped peer at canonical register substantively at
  substantive register: `:peer.start_link/1` substantively links
  peer node to the controlling process at canonical register; if the
  controlling process exits before on_exit fires (ExUnit setup_all
  process lifecycle at canonical register), the peer node
  substantively dies first; subsequent `:peer.stop/1` substantively
  raises "no process" at substrate-state ground truth register.
  Catch + noop canonical at substantive register.
  """
  @spec stop_peer!(pid()) :: :ok
  def stop_peer!(peer) when is_pid(peer) do
    try do
      :peer.stop(peer)
    catch
      :exit, _reason -> :ok
    end
  end

  # ============================================================
  # Cross-node spawn helpers — NAMED functions canonical at
  # substantive register
  # ============================================================
  #
  # Substrate-state observation surfaced at sub-phase 10 substrate
  # landing register: `Node.spawn_link/2` with anonymous fn closures
  # fails on peer with `UndefinedFunctionError` — closures captured
  # from ExUnit test modules substantively NOT loadable at peer
  # register (test modules NOT compiled into peer's code paths
  # canonical at substantive register; only `lib/` + `test/support/`
  # ebin paths propagated via `-pa` canonical at substantive register).
  #
  # Canonical fix at substantive register: NAMED functions in
  # `cluster_helpers.ex` (compiled to `_build/test/lib/dbgi_
  # supervisor/ebin/Elixir.DbgiSupervisor.ClusterHelpers.beam` per
  # ADR-0034 `elixirc_paths(:test)` canonical) substantively
  # loadable on peer via code-path propagation; spawn via
  # `Node.spawn_link/4` (module + function + args; NO closure
  # serialization at substantive register).
  #
  # D-PHASE-10-PEER-CLOSURE-LOADING canonical substrate-build
  # observation candidate (forward-queued per
  # D-AMENDMENT-FORWARD-QUEUE-CLOSURE-CASCADE 18th canonical at
  # substantive register).

  @doc """
  Long-lived peer-side process: joins :pg group, signals join, waits stop.
  """
  @spec peer_pg_member_loop(atom() | term(), pid()) :: :ok
  def peer_pg_member_loop(group, reply_to) do
    :pg.join(DbgiSupervisor.PG, group, self())
    send(reply_to, {:joined, self()})

    receive do
      :stop -> :ok
    end
  end

  @doc """
  Peer-side process: joins :pg group, waits leave signal, leaves, waits stop.
  """
  @spec peer_pg_member_with_leave_loop(atom() | term(), pid()) :: :ok
  def peer_pg_member_with_leave_loop(group, reply_to) do
    :pg.join(DbgiSupervisor.PG, group, self())
    send(reply_to, {:joined, self()})

    receive do
      :leave ->
        :pg.leave(DbgiSupervisor.PG, group, self())
        send(reply_to, :left)
    end

    receive do
      :stop -> :ok
    end
  end

  @doc """
  Peer-side process: tracks presence in DbgiSupervisor.PresenceTracker,
  signals tracked, waits stop.
  """
  @spec peer_track_loop(String.t(), term(), map(), pid()) :: :ok
  def peer_track_loop(topic, key, meta, reply_to) do
    {:ok, _ref} = DbgiSupervisor.PresenceTracker.track(self(), topic, key, meta)
    send(reply_to, {:tracked, self()})

    receive do
      :stop -> :ok
    end
  end

  @doc """
  Peer-side process: tracks presence, waits untrack signal, untracks, waits stop.
  """
  @spec peer_track_untrack_loop(String.t(), term(), map(), pid()) :: :ok
  def peer_track_untrack_loop(topic, key, meta, reply_to) do
    {:ok, _ref} = DbgiSupervisor.PresenceTracker.track(self(), topic, key, meta)
    send(reply_to, {:tracked, self()})

    receive do
      :untrack ->
        :ok = DbgiSupervisor.PresenceTracker.untrack(self(), topic, key)
        send(reply_to, :untracked)
    end

    receive do
      :stop -> :ok
    end
  end

  @doc """
  Peer-side process: subscribes to PubSub topic, signals subscribed,
  relays first received message to reply_to as {:peer_received, msg}.
  """
  @spec peer_subscribe_relay(String.t(), pid()) :: :ok
  def peer_subscribe_relay(topic, reply_to) do
    :ok = Phoenix.PubSub.subscribe(DbgiSupervisor.PubSub, topic)
    send(reply_to, :subscribed)

    receive do
      msg -> send(reply_to, {:peer_received, msg})
    end
  end

  @doc """
  Peer-side process: subscribes to PubSub topic, signals subscribed,
  relays first received message OR sends :peer_timeout after timeout_ms.
  """
  @spec peer_subscribe_relay_with_timeout(String.t(), pid(), pos_integer()) :: :ok
  def peer_subscribe_relay_with_timeout(topic, reply_to, timeout_ms) do
    :ok = Phoenix.PubSub.subscribe(DbgiSupervisor.PubSub, topic)
    send(reply_to, :subscribed)

    receive do
      msg -> send(reply_to, {:peer_received, msg})
    after
      timeout_ms -> send(reply_to, :peer_timeout)
    end
  end
end
