// In-memory manager for active rooms and realtime presence

const activeRooms = new Map(); // roomId -> { code, joinCode, title, hostUsername, isPublic, hasPassword, updatedAt }
const joinCodeToRoomId = new Map(); // joinCode -> roomId
const onlinePresence = new Map(); // roomId -> Map(username -> lastSeenAtMs)
const memberStates = new Map(); // roomId -> Map(userid -> { isReady, isLeft, lastInput, updatedAt })

function generateJoinCode() {
    let code;
    do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (joinCodeToRoomId.has(code));
    return code;
}

export function activateRoom(roomConfig, hostUserid) {
    if (!roomConfig || !roomConfig.code) return;
    const roomId = String(roomConfig.code).toUpperCase();
    
    // Generate a temporary 6-digit join code
    const joinCode = generateJoinCode();
    
    activeRooms.set(roomId, {
        code: roomId,
        joinCode: joinCode,
        title: roomConfig.title,
        hostUserid: hostUserid,
        isPublic: roomConfig.public_flag,
        hasPassword: !!roomConfig.password_hash,
        updatedAt: roomConfig.updated_at || new Date().toISOString()
    });

    joinCodeToRoomId.set(joinCode, roomId);

    if (!onlinePresence.has(roomId)) {
        onlinePresence.set(roomId, new Map());
    }
}

export function getRoomIdByJoinCode(joinCode) {
    return joinCodeToRoomId.get(String(joinCode));
}

export function deactivateRoom(roomId) {
    const id = String(roomId || '').toUpperCase();
    const room = activeRooms.get(id);
    if (room && room.joinCode) {
        joinCodeToRoomId.delete(room.joinCode);
    }
    activeRooms.delete(id);
    onlinePresence.delete(id);
}

export function isRoomActive(roomCode) {
    return activeRooms.has(String(roomCode || '').toUpperCase());
}

export function touchRoomActivity(roomCode) {
    const code = String(roomCode || '').toUpperCase();
    const room = activeRooms.get(code);
    if (room) {
        room.updatedAt = new Date().toISOString();
    }
}

export function getActiveRooms() {
    return Array.from(activeRooms.values());
}

export function getActiveRoomInfo(roomCode) {
    const code = String(roomCode || '').toUpperCase();
    return activeRooms.get(code) || null;
}

export function setMemberOnline(roomCode, username, isOnline) {
    const code = String(roomCode || '').toUpperCase();
    let presenceMap = onlinePresence.get(code);
    if (!presenceMap) {
        if (!isOnline) return;
        presenceMap = new Map();
        onlinePresence.set(code, presenceMap);
    }

    if (isOnline) {
        presenceMap.set(username, Date.now());
    } else {
        presenceMap.delete(username);
    }
}

export function isMemberOnline(roomCode, username) {
    const code = String(roomCode || '').toUpperCase();
    const presenceMap = onlinePresence.get(code);
    if (!presenceMap) return false;
    return presenceMap.has(username);
}

export function getOnlineMembersCount(roomCode) {
    const code = String(roomCode || '').toUpperCase();
    const presenceMap = onlinePresence.get(code);
    return presenceMap ? presenceMap.size : 0;
}

export function getMemberLastSeenAt(roomCode, username) {
    const code = String(roomCode || '').toUpperCase();
    const presenceMap = onlinePresence.get(code);
    if (!presenceMap) return null;
    const ms = presenceMap.get(username);
    return ms ? new Date(ms).toISOString() : null;
}

export function getMemberState(roomCode, userid) {
    const code = String(roomCode || '').toUpperCase();
    const map = memberStates.get(code);
    if (!map) return null;
    return map.get(userid) || null;
}

export function setMemberState(roomCode, userid, state) {
    const code = String(roomCode || '').toUpperCase();
    if (!memberStates.has(code)) memberStates.set(code, new Map());
    memberStates.get(code).set(userid, { ...state });
}

export function getAllMemberStates(roomCode) {
    const code = String(roomCode || '').toUpperCase();
    return memberStates.get(code) || new Map();
}

export function clearMemberStates(roomCode) {
    const code = String(roomCode || '').toUpperCase();
    memberStates.delete(code);
}
