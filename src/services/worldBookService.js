import fs from 'node:fs';
import path from 'node:path';
import { t } from '../i18n.js';

function getWorldBooksRoot(baseDir, userid) {
    return path.resolve(baseDir, 'data/users', userid, 'worldbooks');
}

function ensureWorldBooksRoot(baseDir, userid) {
    const root = getWorldBooksRoot(baseDir, userid);
    if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
    }
    return root;
}

function sanitizeBaseName(name) {
    const normalized = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');

    return normalized || 'worldbook';
}

function makeUniqueWorldBookPath(root, baseName) {
    let index = 0;
    let fileName = `${baseName}.json`;
    let filePath = path.join(root, fileName);

    while (fs.existsSync(filePath)) {
        index += 1;
        fileName = `${baseName}_${index}.json`;
        filePath = path.join(root, fileName);
    }

    return { fileName, filePath };
}

function toSafeWorldBookFileName(fileName) {
    const normalized = path.basename(String(fileName || ''));
    if (!/^[a-z0-9_]+(?:_[0-9]+)?\.json$/.test(normalized)) {
        throw new Error(t('worldbooks.invalid_filename'));
    }
    return normalized;
}

function toDisplayName(fileName, parsed) {
    const fromParsed = String(parsed?.name || '').trim();
    if (fromParsed) {
        return fromParsed;
    }

    return String(fileName).replace(/\.json$/i, '');
}

function getPositionLabel(positionValue) {
    const positionMap = new Map([
        [0, 'Before Character'],
        [1, 'After Character'],
        [2, 'At Depth'],
        [3, 'Author Note Top'],
        [4, 'Author Note Bottom'],
        [5, 'Chat Top'],
        [6, 'Chat Bottom'],
    ]);

    const numeric = Number(positionValue);
    if (positionMap.has(numeric)) {
        return positionMap.get(numeric);
    }

    if (typeof positionValue === 'string' && positionValue.trim()) {
        return positionValue;
    }

    return 'After Character';
}

function toWorldBookEntriesList(parsed) {
    const rawEntries = parsed?.entries;
    if (!rawEntries || typeof rawEntries !== 'object') {
        return [];
    }

    const entriesList = Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries);

    return entriesList.map((entry, index) => {
        const normalizeKeys = (val) => {
            if (Array.isArray(val)) return val.filter(Boolean).map((item) => String(item));
            if (typeof val === 'string') return val.split(',').map((item) => item.trim()).filter(Boolean);
            return [];
        };
        const keys = normalizeKeys(entry?.key || entry?.keys);
        const secondaryKeys = normalizeKeys(entry?.keysecondary || entry?.secondary_keys);

        const position = entry?.position ?? entry?.extensions?.position ?? 1;
        const depth = entry?.extensions?.depth ?? entry?.depth ?? null;
        const enabled = entry?.disable !== true && entry?.enabled !== false;

        return {
            uid: entry?.uid ?? index,
            comment: String(entry?.comment || '').trim(),
            content: String(entry?.content || '').trim(),
            keys,
            secondaryKeys,
            constant: !!entry?.constant,
            selectiveLogic: Number(entry?.selectiveLogic ?? entry?.extensions?.selectiveLogic ?? 0),
            filterExpression: String(entry?.extensions?.filter || '').trim(),
            order: Number(entry?.order ?? entry?.insertion_order ?? 100),
            position,
            positionLabel: getPositionLabel(position),
            depth: depth === null ? '' : String(depth),
            enabled,
            probability: Number(entry?.probability ?? entry?.extensions?.probability ?? 100),
            scanDepth: entry?.scanDepth ?? entry?.extensions?.scan_depth ?? '',
            caseSensitive: entry?.caseSensitive ?? entry?.extensions?.case_sensitive ?? '',
            matchWholeWords: entry?.matchWholeWords ?? entry?.extensions?.match_whole_words ?? '',
            useGroupScoring: entry?.useGroupScoring ?? entry?.extensions?.use_group_scoring ?? '',
            automationId: String(entry?.automationId ?? entry?.extensions?.automation_id ?? ''),
            excludeRecursion: !!entry?.excludeRecursion,
            delayUntilRecursion: !!entry?.delayUntilRecursion,
            preventRecursion: !!entry?.preventRecursion,
            ignoreBudget: !!entry?.ignoreBudget,
            role: Number(entry?.role ?? entry?.extensions?.role ?? 0),
            group: String(entry?.group ?? entry?.extensions?.group ?? ''),
            groupOverride: !!(entry?.groupOverride ?? entry?.extensions?.group_override),
            groupWeight: Number(entry?.groupWeight ?? entry?.extensions?.group_weight ?? 100),
            sticky: Number(entry?.sticky ?? entry?.extensions?.sticky ?? 0),
            cooldown: Number(entry?.cooldown ?? entry?.extensions?.cooldown ?? 0),
            delay: Number(entry?.delay ?? entry?.extensions?.delay ?? 0),
            characterFilterText: Array.isArray(entry?.characterFilter?.names) ? entry.characterFilter.names.join(', ') : '',
            characterFilterExclude: !!entry?.characterFilter?.isExclude,
            triggerType: String(entry?.extensions?.trigger_type || ''),
        };
    }).sort((a, b) => a.order - b.order);
}

export function listWorldBooks(baseDir, userid) {
    const root = ensureWorldBooksRoot(baseDir, userid);

    return fs.readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const fullPath = path.join(root, entry.name);
            const stats = fs.statSync(fullPath);
            let parsed = null;

            try {
                parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            } catch {
                parsed = null;
            }

            return {
                fileName: entry.name,
                displayName: toDisplayName(entry.name, parsed),
                size: stats.size,
                updatedAt: stats.mtime.toISOString(),
            };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function readWorldBook(baseDir, userid, fileName) {
    const root = ensureWorldBooksRoot(baseDir, userid);
    const safeName = toSafeWorldBookFileName(fileName);
    const filePath = path.join(root, safeName);

    if (!fs.existsSync(filePath)) {
        throw new Error(t('worldbooks.not_found'));
    }

    const jsonText = fs.readFileSync(filePath, 'utf8');
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch {
        throw new Error(t('worldbooks.json_invalid'));
    }

    return {
        fileName: safeName,
        displayName: toDisplayName(safeName, parsed),
        entriesList: toWorldBookEntriesList(parsed),
        jsonText,
        parsed,
    };
}

export function createWorldBook(baseDir, userid, worldBookName, worldBookJson = '') {
    const root = ensureWorldBooksRoot(baseDir, userid);
    const name = String(worldBookName || '').trim();
    if (!name) {
        throw new Error(t('worldbooks.name_empty'));
    }

    let parsed = {
        name,
        entries: {},
    };

    const rawJson = String(worldBookJson || '').trim();
    if (rawJson) {
        try {
            parsed = JSON.parse(rawJson);
        } catch {
            throw new Error(t('worldbooks.json_format_invalid'));
        }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(t('worldbooks.json_not_object'));
    }

    if (!parsed.name) {
        parsed.name = name;
    }

    const { fileName, filePath } = makeUniqueWorldBookPath(root, sanitizeBaseName(name));
    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2));

    return { fileName, displayName: parsed.name };
}

export function importWorldBook(baseDir, userid, worldBookName, worldBookJson) {
    const rawJson = String(worldBookJson || '').trim();
    if (!rawJson) {
        throw new Error('世界书内容不能为空');
    }

    let parsed;
    try {
        parsed = JSON.parse(rawJson);
    } catch {
        throw new Error(t('worldbooks.json_format_invalid'));
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(t('worldbooks.json_not_object'));
    }

    const displayName = String(worldBookName || parsed.name || '').trim() || 'imported_worldbook';
    if (!parsed.name) {
        parsed.name = displayName;
    }

    const root = ensureWorldBooksRoot(baseDir, userid);
    const { fileName, filePath } = makeUniqueWorldBookPath(root, sanitizeBaseName(displayName));
    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2));

    return { fileName, displayName: parsed.name };
}

export function updateWorldBook(baseDir, userid, fileName, worldBookJson) {
    const safeName = toSafeWorldBookFileName(fileName);
    const root = ensureWorldBooksRoot(baseDir, userid);
    const filePath = path.join(root, safeName);

    if (!fs.existsSync(filePath)) {
        throw new Error(t('worldbooks.not_found'));
    }

    const rawJson = String(worldBookJson || '').trim();
    if (!rawJson) {
        throw new Error(t('worldbooks.content_empty'));
    }

    let parsed;
    try {
        parsed = JSON.parse(rawJson);
    } catch {
        throw new Error(t('worldbooks.json_format_invalid'));
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(t('worldbooks.json_not_object'));
    }

    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2));

    return {
        fileName: safeName,
        displayName: toDisplayName(safeName, parsed),
    };
}

export function saveImportedWorldBookFromCharacter(baseDir, userid, worldBookName, worldBookData) {
    const root = ensureWorldBooksRoot(baseDir, userid);
    const safeBaseName = sanitizeBaseName(worldBookName || 'character_lorebook');
    const { fileName, filePath } = makeUniqueWorldBookPath(root, safeBaseName);
    fs.writeFileSync(filePath, JSON.stringify(worldBookData, null, 2));
    return fileName;
}
