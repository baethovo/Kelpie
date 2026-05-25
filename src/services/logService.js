import fs from 'node:fs';
import path from 'node:path';

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function sanitizeFileName(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'unknown';
}

function safeJson(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return JSON.stringify({ error: 'unserializable_payload' });
    }
}

function nowIso() {
    return new Date().toISOString();
}

function getLogsRoot(baseDir) {
    return path.resolve(baseDir, 'data/logs');
}

function getDailyLogPath(baseDir) {
    const date = nowIso().slice(0, 10);
    return path.join(getLogsRoot(baseDir), `${date}.jsonl`);
}

function getSessionLogPath(baseDir, hostUsername, sessionId) {
    const host = sanitizeFileName(hostUsername);
    const id = Number(sessionId);
    const dir = path.join(getLogsRoot(baseDir), 'sessions', host);
    ensureDir(dir);
    return path.join(dir, `${id}.jsonl`);
}

function appendLine(filePath, line) {
    ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, `${line}\n`, 'utf8');
}

function toRedactedMeta(meta = {}) {
    const clone = { ...meta };
    if (clone.apiKey) {
        clone.apiKey = '[REDACTED]';
    }
    if (clone.authorization) {
        clone.authorization = '[REDACTED]';
    }
    return clone;
}

export function logEvent(baseDir, eventType, payload = {}, options = {}) {
    const record = {
        at: nowIso(),
        type: String(eventType || 'event').trim(),
        payload: toRedactedMeta(payload),
    };

    const line = safeJson(record);
    appendLine(getDailyLogPath(baseDir), line);

    const sessionId = Number(options.sessionId || payload.sessionId || 0);
    const hostUsername = String(options.hostUsername || payload.hostUsername || '').trim();
    if (sessionId > 0 && hostUsername) {
        appendLine(getSessionLogPath(baseDir, hostUsername, sessionId), line);
    }
}

export function logError(baseDir, eventType, error, payload = {}, options = {}) {
    logEvent(baseDir, eventType, {
        ...payload,
        errorMessage: String(error?.message || error || 'unknown_error'),
        errorStack: String(error?.stack || ''),
    }, options);
}
