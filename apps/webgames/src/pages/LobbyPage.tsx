import {
  ApiError,
  formatStakeAmount,
  GameRoomStatus,
  GameType,
  LOBBY_CHANNEL,
  LOBBY_EVENTS,
  ROOM_EVENTS,
  STAKE_ASSET_SYMBOLS,
  type GameRoomSummary,
  type RoomPlayerJoinedPayload,
  type RoomStartedPayload,
} from '@gaming-platform/core';
import { Copy, PaperPlaneTilt, Plus, SignIn, UsersThree } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CreateRoomModal } from '../components/CreateRoomModal';
import { GameIcon } from '../components/GameIcon';
import { WaitingForPlayersModal } from '../components/WaitingForPlayersModal';
import { apiClient } from '../lib/api';
import { GAME_LABELS, isWebPlayable } from '../lib/format';
import { useActiveRoomStore } from '../store/active-room.store';
import { useLobbyStore } from '../store/lobby.store';
import { useSessionStore } from '../store/session.store';
import { useUsernames } from '../store/usernames';
import { useWebsocketStore } from '../store/websocket.store';

const FILTERS: { label: string; value: GameType | null }[] = [
  { label: 'All games', value: null },
  { label: 'Battleships', value: GameType.NavalBattle },
  { label: 'Salvo', value: GameType.Salvo },
  { label: 'Triple Cut', value: GameType.TripleCut },
  { label: 'Ludo', value: GameType.Ludo },
  { label: 'Chroma Clash', value: GameType.ChromaClash },
];

export function LobbyPage() {
  const navigate = useNavigate();
  const myUserId = useSessionStore(s => s.user?.id);
  const referralCode = useSessionStore(s => s.user?.referralCode);
  const { rooms, status, error, filters, load, setGameTypeFilter, upsert, remove } =
    useLobbyStore();
  const { joinChannel, leaveChannel, on } = useWebsocketStore();
  const socketStatus = useWebsocketStore(s => s.status);

  const activeRoom = useActiveRoomStore(s => s.room);
  const setActiveRoom = useActiveRoomStore(s => s.setRoom);
  const patchActiveRoom = useActiveRoomStore(s => s.patchRoom);
  const refreshActiveRoom = useActiveRoomStore(s => s.refresh);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [joinCodeOpen, setJoinCodeOpen] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [closingRoom, setClosingRoom] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  // The waiting modal is the room card's expanded form; minimizing only hides it.
  const [waitingMinimized, setWaitingMinimized] = useState(false);
  // A multi-seat room I joined but do not own: I wait for it to start too.
  const [joinedRoom, setJoinedRoom] = useState<GameRoomSummary | null>(null);
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // The opponent-joined payload carries only a room id, so the creator's own
  // room is what tells us which board to open.
  const activeRoomRef = useRef(activeRoom);
  activeRoomRef.current = activeRoom;
  const joinedRoomRef = useRef(joinedRoom);
  joinedRoomRef.current = joinedRoom;

  const hostIds = useMemo(() => rooms.map(room => room.creatorUserId), [rooms]);
  const usernames = useUsernames(hostIds);

  useEffect(() => {
    void load();
    void refreshActiveRoom();
  }, [load, refreshActiveRoom]);

  useEffect(() => {
    joinChannel(LOBBY_CHANNEL);
    const offAdded = on(LOBBY_EVENTS.roomAdded, payload =>
      upsert(payload as GameRoomSummary),
    );
    const offUpdated = on(LOBBY_EVENTS.roomUpdated, payload =>
      upsert(payload as GameRoomSummary),
    );
    const offRemoved = on(LOBBY_EVENTS.roomRemoved, payload =>
      remove((payload as { roomId: string }).roomId),
    );
    // A 2-player room starts the instant someone joins mine.
    const offOpponent = on(ROOM_EVENTS.opponentJoined, payload => {
      const { roomId } = payload as { roomId: string };
      const mine = activeRoomRef.current;
      if (!mine || mine.id !== roomId) return;
      navigate(`/game/${mine.gameType}/${roomId}`);
    });

    // A 3-4 seat room fills a seat at a time; both the host and everyone
    // already sitting need the count to move.
    const applySeatCount = (payload: unknown) => {
      const p = payload as RoomPlayerJoinedPayload;
      const patch = (room: GameRoomSummary | null) =>
        room && room.id === p.roomId
          ? { ...room, joinedCount: p.joinedCount }
          : room;
      patchActiveRoom(patch);
      setJoinedRoom(patch);
    };
    const offPlayerJoined = on(ROOM_EVENTS.playerJoined, applySeatCount);
    const offPlayerLeft = on(ROOM_EVENTS.playerLeft, applySeatCount);

    // Whoever is sitting at a multi-seat room enters when it starts - full
    // table or the host starting early.
    const offStarted = on(ROOM_EVENTS.started, payload => {
      const { roomId } = payload as RoomStartedPayload;
      const room =
        [activeRoomRef.current, joinedRoomRef.current].find(
          candidate => candidate?.id === roomId,
        ) ?? null;
      if (!room) return;
      navigate(`/game/${room.gameType}/${roomId}`);
    });

    return () => {
      offAdded();
      offUpdated();
      offRemoved();
      offOpponent();
      offPlayerJoined();
      offPlayerLeft();
      offStarted();
      leaveChannel(LOBBY_CHANNEL);
    };
  }, [
    joinChannel,
    leaveChannel,
    on,
    upsert,
    remove,
    navigate,
    socketStatus,
    patchActiveRoom,
  ]);

  async function join(room: GameRoomSummary) {
    setJoiningId(room.id);
    setJoinError(null);
    try {
      const joined = await apiClient.joinGameRoom(room.id);
      // Joining the last free seat starts the match; any earlier seat leaves
      // the table still filling, and the board does not exist yet.
      if (joined.status === GameRoomStatus.Pending) {
        setJoinedRoom(joined);
        setWaitingMinimized(false);
        setJoiningId(null);
        return;
      }
      navigate(`/game/${joined.gameType}/${joined.id}`);
    } catch (err) {
      setJoinError(
        err instanceof ApiError ? err.message : 'Could not join that room.',
      );
      setJoiningId(null);
    }
  }

  /** Host-only: start a multi-seat room before every seat is taken. */
  async function startNow(room: GameRoomSummary) {
    setStarting(true);
    setJoinError(null);
    try {
      await apiClient.startGameRoom(room.id);
      navigate(`/game/${room.gameType}/${room.id}`);
    } catch (err) {
      setJoinError(
        err instanceof ApiError ? err.message : 'Could not start that room.',
      );
    } finally {
      setStarting(false);
    }
  }

  /** Give up a seat in a room that has not started yet. */
  async function leaveRoom(room: GameRoomSummary) {
    setLeaving(true);
    setJoinError(null);
    try {
      await apiClient.leaveGameRoom(room.id);
      setJoinedRoom(null);
      await load();
    } catch (err) {
      setJoinError(
        err instanceof ApiError ? err.message : 'Could not leave that room.',
      );
    } finally {
      setLeaving(false);
    }
  }

  async function closeRoom(room: GameRoomSummary) {
    setClosingRoom(true);
    setJoinError(null);
    try {
      await apiClient.closeGameRoom(room.id);
      setActiveRoom(null);
      await load();
    } catch (err) {
      setJoinError(
        err instanceof ApiError ? err.message : 'Could not close that room.',
      );
    } finally {
      setClosingRoom(false);
    }
  }

  async function joinByCode(event: React.FormEvent) {
    event.preventDefault();
    setJoinError(null);
    try {
      const room = await apiClient.getGameRoomByCode(code);
      if (!isWebPlayable(room.gameType)) {
        setJoinError(`${GAME_LABELS[room.gameType]} is playable on mobile only.`);
        return;
      }
      await join(room);
      setJoinCodeOpen(false);
    } catch (err) {
      setJoinError(
        err instanceof ApiError ? err.message : 'No open room with that code.',
      );
    }
  }

  const openRooms = rooms.filter(room => room.creatorUserId !== myUserId);
  const activeFilter = filters.gameTypes?.[0] ?? null;

  return (
    <div className="page">
      <div className="page-split">
        <div
          style={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s-5)',
          }}
        >
          <FeaturedRoom
            room={openRooms.find(room => isWebPlayable(room.gameType)) ?? null}
            hostName={name => usernames[name] ?? 'someone'}
            onJoin={join}
          />

          <div className="toolbar">
            <div className="filter-strip">
              {FILTERS.map(filter => (
                <button
                  key={filter.label}
                  type="button"
                  className={
                    activeFilter === filter.value ? 'pill is-active' : 'pill'
                  }
                  onClick={() => setGameTypeFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="toolbar-actions">
              <button
                type="button"
                className="btn btn-lime"
                onClick={() => setCreating(true)}
              >
                <Plus size={14} weight="bold" />
                Create room
              </button>
              <button
                type="button"
                className="btn btn-outline-lime"
                onClick={() => {
                  setJoinError(null);
                  setJoinCodeOpen(true);
                }}
              >
                <SignIn size={14} weight="bold" />
                Join with code
              </button>
            </div>
          </div>

          {joinError && <div className="banner">{joinError}</div>}

          <div className="rows">
            <div className="row-head room-grid">
              <span>ROOM</span>
              <span>HOST</span>
              <span>ENTRY</span>
              <span>PLAYERS</span>
              <span />
            </div>

            {status === 'loading' && rooms.length === 0 && (
              <div className="empty">
                <span className="spinner" />
              </div>
            )}
            {status === 'error' && <div className="banner">{error}</div>}
            {status === 'ready' && openRooms.length === 0 && (
              <div className="lobby-quiet">
                <span className="lobby-quiet-icon">
                  <PaperPlaneTilt size={22} />
                </span>
                <div className="lobby-quiet-text">
                  <h2 className="lobby-quiet-title">
                    The lobby is quiet - open the first room
                  </h2>
                  <p className="lobby-quiet-blurb">
                    Rooms you open are listed instantly and usually fill within
                    a minute. Your stake only locks once an opponent joins.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-lime"
                  onClick={() => setCreating(true)}
                >
                  <Plus size={14} weight="bold" />
                  Create room
                </button>
              </div>
            )}

            {openRooms.map(room => {
              const playable = isWebPlayable(room.gameType);
              return (
                <div
                  key={room.id}
                  className="row row-hover room-grid"
                >
                  <span className="row-name">
                    <GameIcon gameType={room.gameType} />
                    {GAME_LABELS[room.gameType]}
                  </span>
                  <span className="muted">
                    {usernames[room.creatorUserId] ?? '...'}
                  </span>
                  <span className="mono" style={{ color: 'var(--gold)' }}>
                    {room.stakeToken === null || room.stakeAmount === null
                      ? 'Free'
                      : `${formatStakeAmount(room.stakeAmount, room.stakeToken)} ${
                          STAKE_ASSET_SYMBOLS[room.stakeToken]
                        }`}
                  </span>
                  <span className="muted">
                    {room.joinedCount} / {room.playerCount}
                  </span>
                  {playable ? (
                    <button
                      type="button"
                      className="btn btn-outline-lime"
                      onClick={() => join(room)}
                      disabled={joiningId === room.id}
                    >
                      {joiningId === room.id ? '...' : 'Join'}
                    </button>
                  ) : (
                    <span
                      className="muted"
                      style={{ textAlign: 'center', fontSize: 11 }}
                    >
                      Mobile only
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <aside
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}
        >
          {activeRoom && (
            <div className="card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span className="card-label">YOUR OPEN ROOM</span>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 10,
                    letterSpacing: '0.09em',
                    color: 'var(--lime)',
                  }}
                >
                  {activeRoom.joinedCount} / {activeRoom.playerCount}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s-3)',
                  marginTop: 'var(--s-4)',
                }}
              >
                <GameIcon gameType={activeRoom.gameType} size={38} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {GAME_LABELS[activeRoom.gameType]}
                  </div>
                  <div
                    className="mono"
                    style={{
                      marginTop: 'var(--s-2)',
                      fontSize: 11,
                      color: 'var(--text-3)',
                    }}
                  >
                    {activeRoom.code ?? ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--s-3)', marginTop: 'var(--s-4)' }}>
                {activeRoom.status === GameRoomStatus.Pending ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-surface btn-block"
                      onClick={() => void closeRoom(activeRoom)}
                      disabled={closingRoom}
                    >
                      {closingRoom ? <span className="spinner" /> : 'Close room'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-lime btn-block"
                      onClick={() => setWaitingMinimized(false)}
                    >
                      Show
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-lime btn-block"
                    onClick={() => navigate(`/game/${activeRoom.gameType}/${activeRoom.id}`)}
                  >
                    Resume
                  </button>
                )}
              </div>
            </div>
          )}

          {joinedRoom && (
            <div className="card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span className="card-label">YOUR SEAT</span>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 10,
                    letterSpacing: '0.09em',
                    color: 'var(--lime)',
                  }}
                >
                  {joinedRoom.joinedCount} / {joinedRoom.playerCount}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s-3)',
                  marginTop: 'var(--s-4)',
                }}
              >
                <GameIcon gameType={joinedRoom.gameType} size={38} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {GAME_LABELS[joinedRoom.gameType]}
                  </div>
                  <div
                    style={{
                      marginTop: 'var(--s-2)',
                      fontSize: 11,
                      color: 'var(--text-3)',
                    }}
                  >
                    Waiting for the host
                  </div>
                </div>
              </div>
              <div
                style={{ display: 'flex', gap: 'var(--s-3)', marginTop: 'var(--s-4)' }}
              >
                <button
                  type="button"
                  className="btn btn-surface btn-block"
                  onClick={() => void leaveRoom(joinedRoom)}
                  disabled={leaving}
                >
                  {leaving ? <span className="spinner" /> : 'Leave'}
                </button>
                <button
                  type="button"
                  className="btn btn-lime btn-block"
                  onClick={() => setWaitingMinimized(false)}
                >
                  Show
                </button>
              </div>
            </div>
          )}

          {referralCode && (
            <div className="card-gold">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
                <UsersThree size={15} weight="fill" color="var(--gold)" />
                <span className="card-label-gold">INVITE AND EARN</span>
              </div>
              <p
                style={{
                  margin: 'var(--s-3) 0 0',
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: 'var(--text-2)',
                }}
              >
                A slice of the fee from every match your invites play.
              </p>
              <button
                type="button"
                className="code-box"
                style={{ marginTop: 'var(--s-4)', width: '100%' }}
                onClick={() => {
                  void navigator.clipboard.writeText(referralCode);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
              >
                <span className="code-value" style={{ color: 'var(--gold)' }}>
                  {referralCode}
                </span>
                <Copy size={14} color="var(--text-3)" />
              </button>
              {copiedCode && <span className="card-label">COPIED</span>}
            </div>
          )}

          <div className="card">
            <span className="card-label">PRACTICE</span>
            <p
              style={{
                margin: 'var(--s-3) 0 0',
                fontSize: 12.5,
                color: 'var(--text-2)',
              }}
            >
              Play any arena against a bot. No stake, no clock pressure, no
              opponent to wait for.
            </p>
            <button
              type="button"
              className="btn btn-surface btn-block"
              style={{ marginTop: 'var(--s-4)' }}
              onClick={() => navigate('/games')}
            >
              Practice now
            </button>
          </div>
        </aside>
      </div>

      {creating && (
        <CreateRoomModal
          onClose={() => setCreating(false)}
          onCreated={room => {
            setCreating(false);
            setActiveRoom(room);
            setWaitingMinimized(false);
            void load();
          }}
        />
      )}

      {activeRoom &&
        activeRoom.status === GameRoomStatus.Pending &&
        activeRoom.creatorUserId === myUserId &&
        !waitingMinimized && (
          <WaitingForPlayersModal
            room={activeRoom}
            cancelling={closingRoom}
            starting={starting}
            onMinimize={() => setWaitingMinimized(true)}
            onCancel={() => void closeRoom(activeRoom)}
            onStartNow={() => void startNow(activeRoom)}
          />
        )}

      {joinCodeOpen && (
        <div className="modal-backdrop" onClick={() => setJoinCodeOpen(false)}>
          <form
            className="modal"
            onClick={event => event.stopPropagation()}
            onSubmit={joinByCode}
          >
            <h2 className="modal-title">Join with code</h2>
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
              Enter the six-character room code your host shared.
            </p>
            <input
              className="input"
              value={code}
              onChange={event => setCode(event.target.value.toUpperCase())}
              placeholder="K7P2QX"
              maxLength={6}
              autoFocus
            />
            {joinError && <div className="banner">{joinError}</div>}
            <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
              <button
                type="button"
                className="btn btn-surface btn-block"
                onClick={() => setJoinCodeOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-lime btn-block"
                disabled={code.trim().length < 6 || joiningId !== null}
              >
                {joiningId ? <span className="spinner" /> : 'Join room'}
              </button>
            </div>
          </form>
        </div>
      )}

      {joinedRoom && !waitingMinimized && (
        <WaitingForPlayersModal
          isGuest
          room={joinedRoom}
          cancelling={leaving}
          onMinimize={() => setWaitingMinimized(true)}
          onCancel={() => void leaveRoom(joinedRoom)}
        />
      )}
    </div>
  );
}

function FeaturedRoom({
  room,
  hostName,
  onJoin,
}: {
  room: GameRoomSummary | null;
  hostName: (userId: string) => string;
  onJoin: (room: GameRoomSummary) => void;
}) {
  if (!room) return null;
  return (
    <div className="hero">
      <div className="hero-glow" />
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-2)',
        }}
      >
        <span className="dot" style={{ animation: 'kpulse 1.7s infinite' }} />
        <span
          style={{
            fontWeight: 700,
            fontSize: 9.5,
            letterSpacing: '0.15em',
            color: 'var(--lime-bright)',
          }}
        >
          OPEN NOW
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--s-6)',
          marginTop: 'var(--s-5)',
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 34,
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}
          >
            {GAME_LABELS[room.gameType]}
          </div>
          <div style={{ display: 'flex', gap: 'var(--s-8)', marginTop: 'var(--s-5)' }}>
            <Stat
              value={
                room.stakeToken === null || room.stakeAmount === null
                  ? 'Free'
                  : `${formatStakeAmount(room.stakeAmount, room.stakeToken)} ${
                      STAKE_ASSET_SYMBOLS[room.stakeToken]
                    }`
              }
              label="ENTRY"
              gold
            />
            <Stat value={hostName(room.creatorUserId)} label="HOST" />
            <Stat
              value={`${room.joinedCount} / ${room.playerCount}`}
              label="PLAYERS"
            />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-lime btn-lg"
          onClick={() => onJoin(room)}
        >
          Join room
        </button>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  gold = false,
}: {
  value: string;
  label: string;
  gold?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontWeight: 800,
          fontSize: 20,
          lineHeight: 1,
          color: gold ? 'var(--gold)' : 'var(--text)',
        }}
      >
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
