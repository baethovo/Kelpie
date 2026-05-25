import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { getStore } from '../models/store.js';
import { t } from '../i18n.js';

function sanitizeUserid(userid) {
    const raw = String(userid || '').trim();
    // Only allow Alphanumeric and underscores. No Chinese, dots, slashes, or special symbols.
    const valid = raw.replace(/[^a-zA-Z0-9_]/g, '');
    if (!valid || valid !== raw) {
        throw new Error(t('auth.invalid_userid'));
    }
    return valid;
}

function sanitizeAlias(alias) {
    const raw = String(alias || '').trim();
    const valid = raw.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '');
    return valid || raw; // Keep original if we just want basic stripping, or let it be. Actually, just allow most things for alias, but maybe strip path chars just in case.
}

function getUsersRoot(baseDir) {
    return path.resolve(baseDir, 'data/users');
}

function ensureUsersRoot(baseDir) {
    const usersRoot = getUsersRoot(baseDir);
    if (!fs.existsSync(usersRoot)) {
        fs.mkdirSync(usersRoot, { recursive: true });
    }
}

function buildUserFolder(baseDir, userid) {
    return path.join(getUsersRoot(baseDir), userid);
}

function initUserFolder(baseDir, userid) {
    ensureUsersRoot(baseDir);

    const userDir = buildUserFolder(baseDir, userid);
    const uploadsDir = path.join(userDir, 'uploads');
    const sessionsDir = path.join(userDir, 'session'); 
    const settingsFile = path.join(userDir, 'settings.json');

    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

    if (!fs.existsSync(settingsFile)) {
        fs.writeFileSync(settingsFile, JSON.stringify({
            apiBaseUrl: 'https://api.openai.com/v1',
            apiKey: '',
            model: '',
            temperature: 0.7,
            maxTokens: 1024,
        }, null, 2));
    }
}

function ensureUserUuid(baseDir, user) {
    if (!user || !user.id) {
        return user;
    }
    if (String(user.userUuid || user.user_uuid || '').trim()) {
        return {
            ...user,
            userUuid: user.userUuid || user.user_uuid
        };
    }

    const store = getStore(baseDir);
    const uuid = randomUUID();
    store.saveUser(user.userid, { user_uuid: uuid });
    
    return {
        ...user,
        user_uuid: uuid,
        userUuid: uuid,
    };
}

export async function createUser(baseDir, userid, password) {
    const store = getStore(baseDir);
    const cleanUserid = sanitizeUserid(userid);
    const cleanPassword = String(password || '');

    if (!cleanUserid || !cleanPassword) {
        throw new Error(t('auth.userid_password_empty'));
    }

    if (!/^[a-zA-Z0-9_]{3,32}$/.test(cleanUserid)) {
        throw new Error(t('auth.userid_length_invalid'));
    }

    if (store.getUser(cleanUserid)) {
        throw new Error(t('auth.userid_exists'));
    }

    const userCount = store.userIndex.size;
    const role = userCount === 0 ? 'admin' : 'user';
    const hash = bcrypt.hashSync(cleanPassword, 10);
    const id = Date.now(); 

    const newUser = {
        id: id,
        userid: cleanUserid,
        username: cleanUserid, // Default alias is the userid
        password_hash: hash,
        role,
        created_at: new Date().toISOString(),
        user_uuid: randomUUID()
    };

    await store.saveUser(cleanUserid, newUser);
    initUserFolder(baseDir, cleanUserid);

    return ensureUserUuid(baseDir, newUser);
}

export function verifyUser(baseDir, userid, password) {
    const store = getStore(baseDir);
    const cleanUserid = sanitizeUserid(userid);
    const cleanPassword = String(password || '');

    const user = store.getUser(cleanUserid);
    if (!user) {
        return null;
    }

    const isValid = bcrypt.compareSync(cleanPassword, user.password_hash);
    if (!isValid) {
        return null;
    }

    return ensureUserUuid(baseDir, user);
}

export function getUserById(baseDir, id) {
    const store = getStore(baseDir);
    const user = store.getUserById(id);
    if (!user) return null;
    return ensureUserUuid(baseDir, user);
}

export function getUserByUsername(baseDir, userid) {
    const store = getStore(baseDir);
    const user = store.getUser(userid);
    if (!user) return null;
    return ensureUserUuid(baseDir, user);
}

export async function updateUsername(baseDir, id, newAlias) {
    const store = getStore(baseDir);
    const cleanAlias = sanitizeAlias(newAlias);

    if (!cleanAlias) {
        throw new Error(t('auth.username_empty')); // Still using username string for translation
    }

    if (cleanAlias.length < 1 || cleanAlias.length > 32) {
        throw new Error(t('auth.username_length_invalid'));
    }

    const user = store.getUserById(id);
    if (!user) {
        throw new Error(t('auth.user_not_found'));
    }

    const updated = { ...user, username: cleanAlias };
    await store.saveUser(user.userid, updated); // Use userid as key, update username (alias)
    
    return ensureUserUuid(baseDir, updated);
}

// --- Persona Management ---

const personaCache = new Map();

export async function getPlayerPersona(baseDir, userid, id) {
    const filePath = path.join(buildUserFolder(baseDir, userid), 'USER.md');
    try {
        const stats = await fs.promises.stat(filePath);
        const mtime = stats.mtimeMs;
        const cached = personaCache.get(filePath);
        
        if (cached && cached.type === 'file' && cached.mtime === mtime) {
            return cached.content;
        }

        const rawContent = await fs.promises.readFile(filePath, 'utf-8');
        const content = `[Player ID: ${id}]\n${rawContent.trim()}`;
        personaCache.set(filePath, { type: 'file', mtime, content });
        return content;
    } catch (e) {
        const cached = personaCache.get(filePath);
        if (cached && cached.type === 'empty') {
            return cached.content;
        }

        const fallback = `[Player ID: ${id}] (No persona set)`;
        personaCache.set(filePath, { type: 'empty', content: fallback });
        setTimeout(() => {
            if (personaCache.get(filePath)?.type === 'empty') {
                personaCache.delete(filePath);
            }
        }, 30000); 
        
        return fallback;
    }
}

export async function getRawPlayerPersona(baseDir, userid) {
    const filePath = path.join(buildUserFolder(baseDir, userid), 'USER.md');
    try {
        const rawContent = await fs.promises.readFile(filePath, 'utf-8');
        return rawContent;
    } catch (e) {
        return '';
    }
}

export async function updatePlayerPersona(baseDir, userid, newContent) {
    const filePath = path.join(buildUserFolder(baseDir, userid), 'USER.md');
    const content = String(newContent || '');
    await fs.promises.writeFile(filePath, content, 'utf-8');
    personaCache.delete(filePath);
    return content;
}