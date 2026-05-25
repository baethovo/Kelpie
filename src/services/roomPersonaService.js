import fs from 'node:fs';
import path from 'node:path';
import { getUserById } from './userService.js';
import { getStore } from '../models/store.js';
import { t } from '../i18n.js';

const roomPersonaCache = new Map();

export function getRoomUserPersonaPath(baseDir, roomCode, userId, username) {
    const store = getStore(baseDir);
    const host = store.getRoomHost(roomCode);
    
    let resolvedUsername = username;
    if (!resolvedUsername && userId) {
        // Automatically resolve username if missing
        try {
            const user = getUserById(baseDir, userId);
            if (user) {
                resolvedUsername = user.userid;
            }
        } catch {
            // Best effort
        }
    }

    if (!resolvedUsername) {
        throw new Error(t('room.persona_path_resolve_failed'));
    }

    // Determine the room owner (host). If unknown, fallback to the current user (persona owner)
    const roomOwner = host || resolvedUsername;
    
    // Standardize to use username instead of numeric ID for the subfolder
    // Path: data/users/<host>/session/<roomCode>/user/<player>/USER.md
    return path.resolve(baseDir, 'data/users', String(roomOwner), 'session', roomCode, 'user', String(resolvedUsername), 'USER.md');
}


/**
 * Ensure the user folder for a room exists.
 */

/**
 * Ensure the user folder for a room exists.
 */
function ensureRoomUserDir(baseDir, roomCode, userId, username) {
    const filePath = getRoomUserPersonaPath(baseDir, roomCode, userId, username);
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    return filePath;
}

/**
 * Read the persona for a specific user in a specific room.
 */
export async function readRoomUserPersona(baseDir, roomCode, userId, username) {
    const filePath = getRoomUserPersonaPath(baseDir, roomCode, userId, username);
    const resolvedUsername = username || '未知玩家'; // Basic fallback for UI
    try {
        const stats = await fs.promises.stat(filePath);
        const mtime = stats.mtimeMs;
        const cached = roomPersonaCache.get(filePath);

        if (cached && cached.type === 'file' && cached.mtime === mtime) {
            return cached.content;
        }

        const rawContent = await fs.promises.readFile(filePath, 'utf-8');
        const content = rawContent.trim() 
            ? t('room.persona_format', { username: resolvedUsername, detail: rawContent.trim() })
            : t('room.persona_empty', { username: resolvedUsername });
        
        roomPersonaCache.set(filePath, { type: 'file', mtime, content });
        return content;
    } catch (e) {
        return t('room.persona_empty', { username: username || '未知玩家' });
    }
}

/**
 * Read the raw content for editing.
 */
export async function getRawRoomUserPersona(baseDir, roomCode, userId, username) {
    const filePath = getRoomUserPersonaPath(baseDir, roomCode, userId, username);
    try {
        return await fs.promises.readFile(filePath, 'utf-8');
    } catch (e) {
        return '';
    }
}

/**
 * Update the persona content (USER.md) for a user in a room.
 */
export async function updateRoomUserPersona(baseDir, roomCode, userId, username, newContent) {
    const filePath = ensureRoomUserDir(baseDir, roomCode, userId, username);
    const content = String(newContent || '');
    await fs.promises.writeFile(filePath, content, 'utf-8');
    
    roomPersonaCache.delete(filePath);
    return content;
}

function getInfoFilePath(baseDir, roomCode, userId, username) {
    const filePath = getRoomUserPersonaPath(baseDir, roomCode, userId, username);
    return path.resolve(path.dirname(filePath), 'info.yaml');
}

export async function getRoomUserDisplayName(baseDir, roomCode, userId, username) {
    const filePath = getInfoFilePath(baseDir, roomCode, userId, username);
    try {
        const raw = await fs.promises.readFile(filePath, 'utf-8');
        const lines = raw.split('\n');
        for (const line of lines) {
            const match = line.match(/^displayName:\s*(.+)$/);
            if (match) return match[1].trim();
        }
    } catch {}
    return '';
}

export async function setRoomUserDisplayName(baseDir, roomCode, userId, username, displayName) {
    const personaPath = getRoomUserPersonaPath(baseDir, roomCode, userId, username);
    const dirPath = path.dirname(personaPath);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    const filePath = getInfoFilePath(baseDir, roomCode, userId, username);
    const content = `displayName: ${String(displayName || '').trim()}\n`;
    await fs.promises.writeFile(filePath, content, 'utf-8');
}

