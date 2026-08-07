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
} from '@gaming-platform/core';
import { Plus } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CreateRoomModal } from '../components/CreateRoomModal';
import { GameIcon } from '../components/GameIcon';
import { WaitingForPlayersModal } from '../components/WaitingForPlayersModal';
import { apiClient } from '../lib/api';
import { GAME_LABELS, isWebPlayable } from '../lib/format';
import { useLobbyStore } from '../store/lobby.store';
import { useSessionStore } from '../store/session.store';
import { useUsernames } from '../store/usernames';
import { useWebsocketStore } from '../store/websocket.store';

const ROOM_COLUMNS = '1.7fr 1fr 1fr 1fr 104px';

const FILTERS: { label: string; value: GameType | null }[] = [
  { label: 'All games', value: null },
  { label: 'Triple Cut', value: GameType.TripleCut },
  { label: 'Battleships', value: GameType.NavalBattle },
  { label: 'Salvo', value: GameType.Salvo },
  { label: 'Ludo', value: GameType.Ludo },
];

export function LobbyPage() {
  const navigate = useNavigate();
  const myUserId = useSessionStore(s => s.user?.id);
  const { rooms, status, error, filters, load, setGameTypeFilter, upsert, remove } =
    useLobbyStore();
  const { joinChannel, leaveChannel, on } = useWebsocketStore();
  const socketStatus = useWebsocketStore(s => s.status);

  const [activeRoom, setActiveRoom] = useState<GameRoomSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [closingRoom, setClosingRoom] = useState(false);
  // The waiting modal is the room card's expanded form; minimizing only hides it.
  const [waitingMinimized, setWaitingMinimized] = useState(false);

  const hostIds = useMemo(() => rooms.map(room => room.creatorUserId), [rooms]);
  const usernames = useUsernames(hostIds);

  useEffect(() => {
    void load();
    apiClient
      .getMyActiveGameRoom()
      .then(setActiveRoom)
      .catch(() => setActiveRoom(null));
  }, [load]);

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
    const offOpponent = on(ROOM_EVENTS.opponentJoined, payload =>
      navigate(`/game/${(payload as { roomId: string }).roomId}`),
    );

    return () => {
      offAdded();
      offUpdated();
      offRemoved();
      offOpponent();
      leaveChannel(LOBBY_CHANNEL);
    };
  }, [joinChannel, leaveChannel, on, upsert, remove, navigate, socketStatus]);

  async function join(room: GameRoomSummary) {
    setJoiningId(room.id);
    setJoinError(null);
    try {
      await apiClient.joinGameRoom(room.id);
      navigate(`/game/${room.id}`);
    } catch (err) {
      setJoinError(
        err instanceof ApiError ? err.message : 'Could not join that room.',
      );
      setJoiningId(null);
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

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--s-4)',
            }}
          >
            <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
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
            <button
              type="button"
              className="btn btn-surface"
              onClick={() => setCreating(true)}
            >
              <Plus size={14} weight="bold" color="var(--lime)" />
              Create room
            </button>
          </div>

          {joinError && <div className="banner">{joinError}</div>}

          <div className="rows">
            <div
              className="row-head"
              style={{ gridTemplateColumns: ROOM_COLUMNS }}
            >
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
              <div className="empty">
                <span>No open rooms right now.</span>
                <button
                  type="button"
                  className="btn btn-outline-lime"
                  onClick={() => setCreating(true)}
                >
                  Open the first one
                </button>
              </div>
            )}

            {openRooms.map(room => {
              const playable = isWebPlayable(room.gameType);
              return (
                <div
                  key={room.id}
                  className="row row-hover"
                  style={{ gridTemplateColumns: ROOM_COLUMNS }}
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
                    onClick={() => navigate(`/game/${activeRoom.id}`)}
                  >
                    Resume
                  </button>
                )}
              </div>
            </div>
          )}

          <form className="card" onSubmit={joinByCode}>
            <span className="card-label">JOIN BY CODE</span>
            <input
              className="input"
              style={{ marginTop: 'var(--s-3)' }}
              value={code}
              onChange={event => setCode(event.target.value.toUpperCase())}
              placeholder="K7P2QX"
              maxLength={6}
            />
            <button
              type="submit"
              className="btn btn-outline-lime btn-block"
              style={{ marginTop: 'var(--s-3)' }}
              disabled={code.trim().length < 6}
            >
              Join room
            </button>
          </form>

          <div className="card">
            <span className="card-label">PRACTICE</span>
            <p
              style={{
                margin: 'var(--s-3) 0 0',
                fontSize: 12.5,
                color: 'var(--text-2)',
              }}
            >
              Play Triple Cut against a bot. No stake, no clock pressure, no
              opponent to wait for.
            </p>
            <button
              type="button"
              className="btn btn-surface btn-block"
              style={{ marginTop: 'var(--s-4)' }}
              onClick={() => navigate('/demo')}
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
            onMinimize={() => setWaitingMinimized(true)}
            onCancel={() => void closeRoom(activeRoom)}
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
