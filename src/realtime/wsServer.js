import { WebSocketServer } from 'ws';
import { getUserById } from '../services/userService.js';
import { getRoomPresetState, getRoomRealtimeState, listLobbyRooms, autoCloseRoom, handleImplicitLeave } from '../services/roomService.js';
import { setRealtimeBridge } from './events.js';
import { setMemberOnline, deactivateRoom, isRoomActive, getActiveRoomInfo, getOnlineMembersCount } from './roomStateManager.js';
import { t } from '../i18n.js';

function safeSend(socket, payload) {
    if (!socket || socket.readyState !== 1) {
        return;
    }
    socket.send(JSON.stringify(payload));
}

function createMockRes() {
    return {
        getHeader() { return null; },
        setHeader() {},
        end() {},
    };
}

export function setupRealtimeWsServer({ server, config, sessionParser }) {
    const wss = new WebSocketServer({ noServer: true });
    const baseDir = config.baseDir;
    const HEARTBEAT_TIMEOUT_MS = 15 * 1000;
    const OFFLINE_GRACE_MS = 15 * 1000;
    const roomActiveSocketCount = new Map();
    const offlineTimers = new Map();

    function sendRoomStateToSocket(socket, roomCode, user) {
        try {
            const state = getRoomRealtimeState(baseDir, roomCode, user);
            safeSend(socket, { type: 'room.state', state });
            return true;
        } catch (error) {
            safeSend(socket, { type: 'room.closed', error: String(error?.message || t('room.unavailable')) });
            try {
                socket.close(1008, 'Room unavailable');
            } catch {
                // Ignore close errors.
            }
            return false;
        }
    }

    function sendRoomPresetsToSocket(socket, roomCode, user) {
        try {
            const state = getRoomPresetState(baseDir, roomCode, user);
            safeSend(socket, { type: 'room.presets', state });
        } catch {
            // Non-critical for room stream.
        }
    }

    function broadcastLobbyRooms() {
        const rooms = listLobbyRooms(baseDir);
        wss.clients.forEach((socket) => {
            const ctx = socket.__ctx;
            if (!ctx || ctx.scope !== 'lobby') {
                return;
            }
            safeSend(socket, { type: 'lobby.rooms', rooms });
        });
    }

    function broadcastRoomState(roomCode, includePresets = false) {
        const targetCode = String(roomCode || '').trim().toUpperCase();
        if (!targetCode) {
            return;
        }

        wss.clients.forEach((socket) => {
            const ctx = socket.__ctx;
            if (!ctx || ctx.scope !== 'room' || ctx.roomCode !== targetCode) {
                return;
            }
            if (!sendRoomStateToSocket(socket, targetCode, ctx.user) && includePresets) {
                return;
            }
            if (includePresets) {
                sendRoomPresetsToSocket(socket, targetCode, ctx.user);
            }
        });
    }

    function broadcastRoomStreamEvent(roomCode, streamEvent) {
        const targetCode = String(roomCode || '').trim().toUpperCase();
        if (!targetCode || !streamEvent || typeof streamEvent !== 'object') {
            return;
        }

        wss.clients.forEach((socket) => {
            const ctx = socket.__ctx;
            if (!ctx || ctx.scope !== 'room' || ctx.roomCode !== targetCode) {
                return;
            }
            safeSend(socket, { type: 'room.stream', event: streamEvent });
        });
    }

    function broadcastRoomPresenceEvent(roomCode, presenceEvent) {
        const targetCode = String(roomCode || '').trim().toUpperCase();
        if (!targetCode || !presenceEvent || typeof presenceEvent !== 'object') {
            return;
        }
        wss.clients.forEach((socket) => {
            const ctx = socket.__ctx;
            if (!ctx || ctx.scope !== 'room' || ctx.roomCode !== targetCode) {
                return;
            }
            safeSend(socket, { type: 'room.presence', event: presenceEvent });
        });
    }

    function broadcastRoomClosedEvent(roomCode, roomClosedEvent) {
        const targetCode = String(roomCode || '').trim().toUpperCase();
        if (!targetCode || !roomClosedEvent || typeof roomClosedEvent !== 'object') {
            return;
        }

        wss.clients.forEach((socket) => {
            const ctx = socket.__ctx;
            if (!ctx || ctx.scope !== 'room' || ctx.roomCode !== targetCode) {
                return;
            }
            safeSend(socket, { type: 'room.closed', ...roomClosedEvent });
            try {
                socket.close(4001, 'Room closed');
            } catch {
                // Ignore close errors.
            }
        });
    }

    function memberKey(roomCode, userId) {
        return `${String(roomCode || '').trim().toUpperCase()}::${String(userId || '')}`;
    }

    function getActiveCount(key) {
        return Number(roomActiveSocketCount.get(key) || 0);
    }

    function bumpActiveCount(key, delta) {
        const next = Math.max(0, getActiveCount(key) + delta);
        if (next === 0) {
            roomActiveSocketCount.delete(key);
        } else {
            roomActiveSocketCount.set(key, next);
        }
        return next;
    }

    function clearOfflineTimer(key) {
        const item = offlineTimers.get(key);
        if (item && item.timer) {
            clearTimeout(item.timer);
            offlineTimers.delete(key);
        }
    }

    function scheduleOffline(roomCode, user) {
        const key = memberKey(roomCode, user.id);
        clearOfflineTimer(key);
        const timer = setTimeout(() => {
            if (getActiveCount(key) > 0) {
                return;
            }
            
            setMemberOnline(roomCode, user.userid, false);
            broadcastRoomPresenceEvent(roomCode, { userId: user.userid, username: user.username, isOnline: false });
            offlineTimers.delete(key);
            
            const roomInfo = getActiveRoomInfo(roomCode);
            if (roomInfo) {
                const onlineCount = getOnlineMembersCount(roomCode);
                const isHost = user.userid === roomInfo.hostUserid; // Changed to hostUserid later or keep consistent
                
                if (isHost) {
                    autoCloseRoom(baseDir, roomCode, t('room.host_left_ws')).catch(() => {});
                } else if (onlineCount === 0) {
                    autoCloseRoom(baseDir, roomCode, t('room.all_left_ws')).catch(() => {});
                } else {
                    handleImplicitLeave(baseDir, roomCode, user).catch(() => {});
                }
            } else {
                broadcastLobbyRooms();
            }
        }, OFFLINE_GRACE_MS);
        offlineTimers.set(key, { timer, roomCode, user });
    }

    setRealtimeBridge((event) => {
        if (event?.lobbyChanged) {
            broadcastLobbyRooms();
        }

        const roomCode = String(event?.roomCode || '').trim().toUpperCase();
        if (roomCode) {
            if (event?.roomClosedEvent) {
                broadcastRoomClosedEvent(roomCode, event.roomClosedEvent);
                return;
            }
            if (event?.presenceEvent) {
                broadcastRoomPresenceEvent(roomCode, event.presenceEvent);
            }
            const hasStreamEvent = !!event?.streamEvent;
            if (hasStreamEvent) {
                broadcastRoomStreamEvent(roomCode, event.streamEvent);
            }
            if (!hasStreamEvent || event?.forceState) {
                broadcastRoomState(roomCode, !!event.includePresets);
            }
        }
    });

    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (url.pathname !== '/ws') {
            socket.destroy();
            return;
        }

        sessionParser(req, createMockRes(), () => {
            const userId = req.session?.userId;
            if (!userId) {
                socket.destroy();
                return;
            }
            const user = getUserById(baseDir, userId);
            if (!user) {
                socket.destroy();
                return;
            }

            wss.handleUpgrade(req, socket, head, (ws) => {
                const scope = String(url.searchParams.get('scope') || '').trim().toLowerCase();
                const roomCode = String(url.searchParams.get('code') || '').trim().toUpperCase();
                ws.__ctx = {
                    user,
                    scope: scope === 'lobby' ? 'lobby' : 'room',
                    roomCode,
                };

                wss.emit('connection', ws, req);
            });
        });
    });

    wss.on('connection', (socket) => {
        const ctx = socket.__ctx;
        if (!ctx) {
            socket.close(1008, 'Invalid context');
            return;
        }

        if (ctx.scope === 'lobby') {
            safeSend(socket, { type: 'lobby.rooms', rooms: listLobbyRooms(baseDir) });
            return;
        }

        if (!ctx.roomCode) {
            socket.close(1008, 'Missing room code');
            return;
        }

        if (!isRoomActive(ctx.roomCode)) {
            socket.close(4001, 'Room is closed');
            return;
        }

        const key = memberKey(ctx.roomCode, ctx.user.id);
        bumpActiveCount(key, 1);
        clearOfflineTimer(key);
        socket.__lastHeartbeatAt = Date.now();
        
        setMemberOnline(ctx.roomCode, ctx.user.userid, true);
        broadcastLobbyRooms();
        broadcastRoomPresenceEvent(ctx.roomCode, { userId: ctx.user.userid, username: ctx.user.username, isOnline: true });

        socket.on('message', (raw) => {
            socket.__lastHeartbeatAt = Date.now();
            try {
                const payload = JSON.parse(String(raw || '{}'));
                if (payload?.type === 'heartbeat') {
                    setMemberOnline(ctx.roomCode, ctx.user.userid, true);
                }
            } catch {
                // Ignore malformed client payload.
            }
        });

        socket.on('close', () => {
            bumpActiveCount(key, -1);
            if (getActiveCount(key) === 0) {
                scheduleOffline(ctx.roomCode, ctx.user);
            }
        });

        if (!sendRoomStateToSocket(socket, ctx.roomCode, ctx.user)) {
            return;
        }
        sendRoomPresetsToSocket(socket, ctx.roomCode, ctx.user);
    });

    const heartbeatTimer = setInterval(() => {
        const now = Date.now();
        wss.clients.forEach((socket) => {
            const ctx = socket.__ctx;
            if (!ctx || ctx.scope !== 'room') {
                return;
            }
            const last = Number(socket.__lastHeartbeatAt || 0);
            if (last && now - last > HEARTBEAT_TIMEOUT_MS) {
                try {
                    socket.close(4000, 'Heartbeat timeout');
                } catch {
                    // Ignore close errors.
                }
            }
        });
    }, 5000);

    wss.on('close', () => {
        clearInterval(heartbeatTimer);
        offlineTimers.forEach((item) => {
            if (item && item.timer) clearTimeout(item.timer);
            if (item && item.roomCode && item.user) {
                setMemberOnline(item.roomCode, item.user.userid, false);
            }
        });
        offlineTimers.clear();
        roomActiveSocketCount.clear();
        setRealtimeBridge(null);
    });

    return wss;
}
