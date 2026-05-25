import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import i18next from 'i18next';
import { getStore } from '../models/store.js';
import { logError, logEvent } from './logService.js';
import { readCharacterCard } from './characterService.js';
import { t } from '../i18n.js';

function getSessionBaseRoot(baseDir, userid) {
    return path.resolve(baseDir, 'data/users', userid, 'session');
}

/**
 * Find a room code associated with a session.
 */
function findRoomForSession(baseDir, sessionId) {
    const store = getStore(baseDir);
    // In the new system, roomCode IS the session folder name. 
    // We scan all rooms to find one with the matching internal sessionId.
    for (const [code, hostUserid] of store.roomIndex.entries()) {
        const config = store.getRoomConfig(code);
        if (config && config.session && config.session.id === sessionId) {
            return { id: config.id, code };
        }
    }
    return null;
}

function ensureSessionDir(baseDir, hostUserid, roomCode) {
    const root = getSessionBaseRoot(baseDir, hostUserid);
    const sessionDir = path.join(root, roomCode);
    
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }
    return sessionDir;
}

export function createSession(baseDir, hostUserId, name, characterFile, presetFile, apiProfileId = '') {
    const store = getStore(baseDir);
    const user = store.getUserById(hostUserId);
    if (!user) throw new Error('User not found');

    const cleanName = String(name || '').trim();
    const cleanCharacterFile = String(characterFile || '').trim();
    const cleanPresetFile = String(presetFile || '').trim();
    const cleanApiProfileId = String(apiProfileId || '').trim();

    if (!cleanName) throw new Error(t('sessions.session_name_empty'));
    if (!cleanCharacterFile) throw new Error(t('sessions.character_required'));

    const sessionId = Date.now();
    const session = {
        id: sessionId,
        name: cleanName,
        character_file: cleanCharacterFile,
        preset_file: cleanPresetFile || null,
        api_profile_id: cleanApiProfileId || null,
        hostUserid: user.userid, // Store userid
        hostUsername: user.username, // alias
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    return session;
}

export function getSessionById(baseDir, sessionId) {
    const store = getStore(baseDir);
    const id = String(sessionId || '').toUpperCase();
    
    // First try direct room lookup (since session.id === roomId now)
    const config = store.getRoomConfig(id);
    if (config && config.session) {
        const hostUserid = store.getRoomHost(id);
        const host = store.getUser(hostUserid);
        return {
            ...config.session,
            hostUserId: host?.id,
            hostUserid: hostUserid,
            hostUsername: host?.username || hostUserid,
            characterFile: config.session.character_file,
            presetFile: config.session.preset_file,
            apiProfileId: config.session.api_profile_id,
                worldBookFile: config.session.world_book_file,
            additionalWorldBooks: config.session.additional_world_books || [],
            createdAt: config.session.created_at,
            updatedAt: config.session.updated_at
        };
    }

    // Fallback: search for session id (for legacy sessions)
    for (const [code, hostUserid] of store.roomIndex.entries()) {
        const cfg = store.getRoomConfig(code);
        if (cfg && cfg.session && String(cfg.session.id) === id) {
            const host = store.getUser(hostUserid);
            return {
                ...cfg.session,
                hostUserId: host?.id,
                hostUserid: hostUserid,
                hostUsername: host?.username || hostUserid,
                characterFile: cfg.session.character_file,
                presetFile: cfg.session.preset_file,
                apiProfileId: cfg.session.api_profile_id,
                worldBookFile: cfg.session.world_book_file,
                additionalWorldBooks: cfg.session.additional_world_books || [],
                createdAt: cfg.session.created_at,
                updatedAt: cfg.session.updated_at
            };
        }
    }
    return null;
}

export function listHostSessions(baseDir, hostUserId) {
    const store = getStore(baseDir);
    const host = store.getUserById(hostUserId);
    if (!host) return [];

    const root = getSessionBaseRoot(baseDir, host.userid);
    if (!fs.existsSync(root)) return [];

    const roomCodes = fs.readdirSync(root);
    const sessions = [];

    for (const code of roomCodes) {
        const config = store.getRoomConfig(code);
        if (config && config.session) {
            const messages = store.getRoomMessages(code, 1);
            let characterName = t('sessions.unknown_character');
            try {
                if (config.session.character_file) {
                    characterName = readCharacterCard(baseDir, host.userid, config.session.character_file)?.name || t('sessions.unknown_character');
                }
            } catch {}
            sessions.push({
                id: code,
                internalSessionId: config.session.id,
                name: config.session.name,
                characterFile: config.session.character_file,
                characterName,
                presetFile: config.session.preset_file,
                apiProfileId: config.session.api_profile_id,
                worldBookFile: config.session.world_book_file,
                createdAt: config.session.created_at,
                updatedAt: config.session.updated_at,
                lastMessage: messages[0]?.content || null,
                lastMessageAt: messages[0]?.created_at || null,
                lastDialogueAtText: messages[0] ? new Date(messages[0].created_at).toLocaleString(i18next.language || 'zh-CN') : t('sessions.no_messages')
            });
        }
    }

    return sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function reconcileUserSessions(baseDir, hostUser) {
    // No longer needed as much since file system is the truth.
    // Store._init already re-indexes the roomIndex.
}

export function deleteHostSession(baseDir, hostUserId, sessionId) {
    const store = getStore(baseDir);
    const host = store.getUserById(hostUserId);
    const session = getSessionById(baseDir, sessionId);
    if (!session || Number(session.hostUserId) !== Number(hostUserId)) {
        throw new Error(t('sessions.not_found_or_unauthorized'));
    }

    const roomCode = findRoomForSession(baseDir, sessionId)?.code;
    if (roomCode) {
        const roomPath = store.getRoomPath(roomCode);
        if (fs.existsSync(roomPath)) {
            fs.rmSync(roomPath, { recursive: true, force: true });
        }
        store.roomIndex.delete(roomCode);
    }

    return { sessionId, roomCount: 1 };
}

export async function updateSessionSettings(baseDir, sessionId, settings) {
    const store = getStore(baseDir);
    const session = getSessionById(baseDir, sessionId);
    if (!session) throw new Error('Session not found');

    const roomCode = findRoomForSession(baseDir, sessionId)?.code;
    if (!roomCode) throw new Error('Room not found for session');

    const config = store.getRoomConfig(roomCode);
    const updatedSession = {
        ...config.session,
        updated_at: new Date().toISOString()
    };

    if (settings.name !== undefined) updatedSession.name = String(settings.name).trim();
    if (settings.characterFile !== undefined) updatedSession.character_file = String(settings.characterFile).trim();
    if (settings.presetFile !== undefined) updatedSession.preset_file = String(settings.presetFile).trim() || null;
    if (settings.apiProfileId !== undefined) updatedSession.api_profile_id = String(settings.apiProfileId).trim() || null;
    if (settings.worldBookFile !== undefined) updatedSession.world_book_file = String(settings.worldBookFile).trim() || null;
    if (settings.additionalWorldBooks !== undefined) updatedSession.additional_world_books = Array.isArray(settings.additionalWorldBooks) ? settings.additionalWorldBooks : [];

    await store.saveRoomConfig(roomCode, session.hostUserid, { session: updatedSession });
    return getSessionById(baseDir, sessionId);
}

export async function updateSessionPresetFile(baseDir, sessionId, presetFile) {
    return await updateSessionSettings(baseDir, sessionId, { presetFile });
}

export async function appendSessionMessage(baseDir, sessionId, payload) {
    const store = getStore(baseDir);
    const roomCode = findRoomForSession(baseDir, sessionId)?.code;
    if (!roomCode) throw new Error('Room not found for session');

    const message = {
        floor_no: store.getRoomMessages(roomCode).length + 1,
        speaker_type: payload.speakerType,
        user_id: payload.userId,
        username: payload.username,
        content: payload.content,
        meta: payload.meta,
        created_at: new Date().toISOString()
    };

    await store.appendRoomMessage(roomCode, message);
}

export function listSessionMessages(baseDir, sessionId) {
    const store = getStore(baseDir);
    const roomCode = findRoomForSession(baseDir, sessionId)?.code;
    if (!roomCode) return [];
    
    return store.getRoomMessages(roomCode, 1000).map(m => ({
        ...m,
        roundNo: m.floor_no, // Mapping floor to round for session context
        metaJson: JSON.stringify(m.meta)
    }));
}

export function persistSessionHistoryToHost(baseDir, sessionId) {
    // Already persisted by Store.
    return '';
}

export async function updateSessionWorldBookFile(baseDir, sessionId, worldBookFile) {
    return await updateSessionSettings(baseDir, sessionId, { worldBookFile });
}