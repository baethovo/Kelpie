import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

/**
 * Atomic JSON write to prevent corruption
 */
async function writeJsonAtomic(filePath, data) {
    const tempPath = filePath + '.tmp';
    const dir = path.dirname(filePath);
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fsPromises.rename(tempPath, filePath);
}

function readJsonSync(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        return null;
    }
}

class Store {
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.dataDir = path.resolve(baseDir, 'data');
        this.roomIndex = new Map(); // RoomCode -> HostUsername
        this.userIndex = new Map(); // Username -> UserConfig
        this._init();
    }

    _init() {
        const usersRoot = path.join(this.dataDir, 'users');
        if (!fs.existsSync(usersRoot)) return;

        const usernames = fs.readdirSync(usersRoot);
        for (const userid of usernames) {
            const userDir = path.join(usersRoot, userid);
            if (!fs.statSync(userDir).isDirectory()) continue;

            // Load user config
            const config = readJsonSync(path.join(userDir, 'config.json'));
            if (config) {
                // Ensure userid is set in config
                if (!config.userid) config.userid = userid;
                // Provide a default alias if missing
                if (!config.username) config.username = userid;
                this.userIndex.set(userid, config);
            }

            // Index rooms for this user
            const sessionDir = path.join(userDir, 'session');
            if (fs.existsSync(sessionDir)) {
                const roomCodes = fs.readdirSync(sessionDir);
                for (const code of roomCodes) {
                    this.roomIndex.set(code.toUpperCase(), userid);
                }
            }
        }
    }

    // --- User Operations ---
    getUser(userid) {
        return this.userIndex.get(userid) || null;
    }

    getUserById(userId) {
        // Since we refactored to use userid as the main key
        for (const user of this.userIndex.values()) {
            if (user.id === userId) return user;
        }
        return null;
    }

    async saveUser(userid, data) {
        const userDir = path.join(this.dataDir, 'users', userid);
        const filePath = path.join(userDir, 'config.json');
        const current = this.userIndex.get(userid) || {};
        const updated = { ...current, ...data, userid };
        // Ensure username (alias) exists
        if (!updated.username) updated.username = userid;
        
        await writeJsonAtomic(filePath, updated);
        this.userIndex.set(userid, updated);
        return updated;
    }

    // --- Room & Session Operations ---
    getRoomHost(roomCode) {
        return this.roomIndex.get(String(roomCode).toUpperCase());
    }

    getRoomPath(roomCode) {
        const host = this.getRoomHost(roomCode);
        if (!host) return null;
        return path.join(this.dataDir, 'users', host, 'session', roomCode.toUpperCase());
    }

    getRoomConfig(roomCode) {
        const roomPath = this.getRoomPath(roomCode);
        if (!roomPath) return null;
        return readJsonSync(path.join(roomPath, 'config.json'));
    }

    async saveRoomConfig(roomCode, hostUserid, data) {
        const roomCodeUpper = roomCode.toUpperCase();
        const roomPath = path.join(this.dataDir, 'users', hostUserid, 'session', roomCodeUpper);
        const filePath = path.join(roomPath, 'config.json');
        
        const current = readJsonSync(filePath) || {};
        const updated = { ...current, ...data, code: roomCodeUpper };
        await writeJsonAtomic(filePath, updated);
        this.roomIndex.set(roomCodeUpper, hostUserid);
        return updated;
    }

    getRoomMembers(roomCode) {
        const roomPath = this.getRoomPath(roomCode);
        if (!roomPath) return {};
        return readJsonSync(path.join(roomPath, 'members.json')) || {};
    }

    async saveRoomMembers(roomCode, membersData) {
        const roomPath = this.getRoomPath(roomCode);
        if (!roomPath) return;
        await writeJsonAtomic(path.join(roomPath, 'members.json'), membersData);
    }

    // --- Message Operations ---
    getRoomMessages(roomCode, limit = 240) {
        const roomPath = this.getRoomPath(roomCode);
        if (!roomPath) return [];
        const filePath = path.join(roomPath, 'messages.jsonl');
        if (!fs.existsSync(filePath)) return [];

        const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
        const messages = lines.map(l => JSON.parse(l));
        return messages.slice(-limit);
    }

    async appendRoomMessage(roomCode, message) {
        const roomPath = this.getRoomPath(roomCode);
        if (!roomPath) throw new Error('Room not found');
        const filePath = path.join(roomPath, 'messages.jsonl');
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) await fsPromises.mkdir(dir, { recursive: true });
        
        const line = JSON.stringify(message) + '\n';
        await fsPromises.appendFile(filePath, line, 'utf-8');
    }
}

const stores = new Map();
export function getStore(baseDir) {
    if (!stores.has(baseDir)) {
        stores.set(baseDir, new Store(baseDir));
    }
    return stores.get(baseDir);
}
