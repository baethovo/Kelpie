import fs from 'node:fs';
import path from 'node:path';
import { saveImportedWorldBookFromCharacter, readWorldBook } from './worldBookService.js';
import { t } from '../i18n.js';

function getCharactersRoot(baseDir, userid) {
    return path.resolve(baseDir, 'data/users', userid, 'characters');
}

function ensureCharactersRoot(baseDir, userid) {
    const root = getCharactersRoot(baseDir, userid);
    if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
    }
    return root;
}

function sanitizeCardFileName(name) {
    const normalized = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');

    return normalized || 'character';
}

function makeUniqueFilePath(root, baseName) {
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

function resolveCardDisplayName(rawName, parsed) {
    const candidate = String(rawName || parsed?.data?.name || parsed?.name || parsed?.char_name || '').trim();
    return candidate || 'Unnamed Character';
}

function getCardWorldBook(parsed) {
    const direct = String(parsed?.worldBook || parsed?.data?.worldBook || '').trim();
    if (direct) {
        return direct;
    }

    const meta = String(parsed?.meta?.worldBook || parsed?.data?.meta?.worldBook || '').trim();
    return meta;
}

function toSafeStoredFileName(fileName) {
    const normalized = path.basename(String(fileName || ''));
    if (!/^[a-z0-9_]+(?:_[0-9]+)?\.json$/.test(normalized)) {
        throw new Error(t('characters.invalid_filename'));
    }
    return normalized;
}

function getEmbeddedCharacterBook(parsed) {
    const candidates = [
        parsed?.character_book,
        parsed?.data?.character_book,
        parsed?.lorebook,
        parsed?.data?.lorebook,
    ];

    for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'object') {
            continue;
        }
        if (Array.isArray(candidate.entries)) {
            return candidate;
        }
        if (candidate.entries && typeof candidate.entries === 'object') {
            return {
                ...candidate,
                entries: Object.values(candidate.entries),
            };
        }
    }

    return null;
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

function toCharacterBookEntryView(entry, index) {
    const position = entry?.extensions?.position ?? (entry?.position === 'before_char' ? 0 : 1);
    const depth = entry?.extensions?.depth ?? entry?.depth ?? null;
    const enabled = entry?.enabled !== false && entry?.disable !== true;

    return {
        uid: entry?.id ?? entry?.uid ?? index,
        keys: Array.isArray(entry?.keys) ? entry.keys : (Array.isArray(entry?.key) ? entry.key : []),
        secondaryKeys: Array.isArray(entry?.secondary_keys) ? entry.secondary_keys : (Array.isArray(entry?.keysecondary) ? entry.keysecondary : []),
        comment: String(entry?.comment || '').trim(),
        content: String(entry?.content || '').trim(),
        order: Number(entry?.insertion_order ?? entry?.order ?? 100),
        position,
        positionLabel: getPositionLabel(position),
        depth: depth === null ? '' : String(depth),
        enabled,
    };
}

function getCharacterMeta(parsed) {
    const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : {};
    return {
        scenario: String(data.scenario || data.situation || parsed?.scenario || parsed?.situation || '').trim(),
        firstMessage: String(
            data.first_mes
            || data.firstMessage
            || data.first_message
            || data.greeting
            || data.opening_message
            || parsed?.first_mes
            || parsed?.firstMessage
            || parsed?.first_message
            || parsed?.greeting
            || parsed?.opening_message
            || ''
        ).trim(),
        messageExample: String(data.mes_example || data.example_dialogue || parsed?.mes_example || parsed?.example_dialogue || '').trim(),
        personality: String(data.personality || data.persona || parsed?.personality || parsed?.persona || '').trim(),
        systemPrompt: String(data.system_prompt || data.systemPrompt || parsed?.system_prompt || parsed?.systemPrompt || '').trim(),
        postHistoryInstructions: String(data.post_history_instructions || data.postHistoryInstructions || parsed?.post_history_instructions || parsed?.postHistoryInstructions || '').trim(),
        creatorNotes: String(data.creator_notes || data.creatorNotes || parsed?.creator_notes || parsed?.creatorNotes || parsed?.creatorcomment || '').trim(),
        tags: Array.isArray(data.tags) ? data.tags : (Array.isArray(parsed?.tags) ? parsed.tags : []),
        alternateGreetings: Array.isArray(data.alternate_greetings)
            ? data.alternate_greetings
            : (Array.isArray(parsed?.alternate_greetings)
                ? parsed.alternate_greetings
                : (Array.isArray(data.greetings) ? data.greetings : [])),
    };
}

function convertCharacterBookToWorldBook(characterBook) {
    const result = {
        name: String(characterBook?.name || '').trim() || 'Embedded Lorebook',
        entries: {},
        originalData: characterBook,
    };

    const rawEntries = Array.isArray(characterBook.entries) ? characterBook.entries : Object.values(characterBook.entries || {});
    rawEntries.forEach((entry, index) => {
        const uid = entry?.id ?? index;
        result.entries[String(uid)] = {
            uid,
            key: Array.isArray(entry?.keys) ? entry.keys : [],
            keysecondary: Array.isArray(entry?.secondary_keys) ? entry.secondary_keys : [],
            comment: String(entry?.comment || ''),
            content: String(entry?.content || ''),
            constant: !!entry?.constant,
            selective: !!entry?.selective,
            order: Number(entry?.insertion_order ?? 100),
            disable: entry?.enabled === false,
            position: entry?.extensions?.position ?? (entry?.position === 'before_char' ? 0 : 1),
            extensions: entry?.extensions || {},
            selectiveLogic: Number(entry?.selectiveLogic ?? entry?.extensions?.selectiveLogic ?? 0),
            probability: Number(entry?.probability ?? entry?.extensions?.probability ?? 100),
            scanDepth: Number(entry?.scanDepth ?? entry?.extensions?.scan_depth ?? 0),
            caseSensitive: !!(entry?.caseSensitive ?? entry?.extensions?.case_sensitive),
            matchWholeWords: !!(entry?.matchWholeWords ?? entry?.extensions?.match_whole_words),
            useGroupScoring: !!(entry?.useGroupScoring ?? entry?.extensions?.use_group_scoring),
            group: String(entry?.group ?? entry?.extensions?.group ?? ''),
            groupOverride: !!(entry?.groupOverride ?? entry?.extensions?.group_override),
            groupWeight: Number(entry?.groupWeight ?? entry?.extensions?.group_weight ?? 100),
            excludeRecursion: !!entry?.excludeRecursion,
            delayUntilRecursion: !!entry?.delayUntilRecursion,
            preventRecursion: !!entry?.preventRecursion,
            ignoreBudget: !!entry?.ignoreBudget,
        };
    });

    return result;
}

function getAvatarPath(baseDir, userid, fileName) {
    const root = path.resolve(baseDir, 'data/users', userid, 'avatars');
    if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
    }
    const avatarName = String(fileName).replace(/\.json$/i, '.png');
    return path.join(root, avatarName);
}

function getAvatarPathWithExt(baseDir, userid, fileName, ext = '.png') {
    const root = path.resolve(baseDir, 'data/users', userid, 'avatars');
    if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
    }
    const avatarName = String(fileName).replace(/\.json$/i, ext);
    return path.join(root, avatarName);
}

function resolveLocalAvatarPath(baseDir, userid, fileName) {
    const exts = ['.png', '.jpg', '.jpeg', '.webp'];
    for (const ext of exts) {
        const candidate = getAvatarPathWithExt(baseDir, userid, fileName, ext);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

function resolveInlineAvatarUrl(parsed) {
    const candidates = [
        parsed?.avatar,
        parsed?.data?.avatar,
        parsed?.meta?.avatar,
    ];
    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (!value || value.toLowerCase() === 'none') {
            continue;
        }
        if (/^(https?:\/\/|data:image\/|\/)/i.test(value)) {
            return value;
        }
    }
    const textCandidates = [
        String(parsed?.data?.first_mes || ''),
        String(parsed?.first_mes || ''),
        String(parsed?.data?.description || ''),
        String(parsed?.description || ''),
    ];
    for (const text of textCandidates) {
        const markdownMatch = text.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
        if (markdownMatch?.[1]) {
            return markdownMatch[1];
        }
        const plainMatch = text.match(/https?:\/\/[^\s)]+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)]*)?/i);
        if (plainMatch?.[0]) {
            return plainMatch[0];
        }
    }
    return '';
}

function detectImageExtFromBuffer(buffer) {
    if (!buffer || buffer.length < 12) return '.png';
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    if (isPng) return '.png';
    const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    if (isJpeg) return '.jpg';
    const isWebp = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]) === 'RIFF'
        && String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]) === 'WEBP';
    if (isWebp) return '.webp';
    return '.png';
}

export function listCharacterCards(baseDir, userid) {
    const root = ensureCharactersRoot(baseDir, userid);

    return fs.readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const fullPath = path.join(root, entry.name);
            const stats = fs.statSync(fullPath);
            let displayName = entry.name.replace(/\.json$/i, '');
            let worldBook = '';

            try {
                const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                displayName = resolveCardDisplayName('', parsed);
                worldBook = getCardWorldBook(parsed);
                const inlineAvatarUrl = resolveInlineAvatarUrl(parsed);
                if (inlineAvatarUrl) {
                    return {
                        fileName: entry.name,
                        displayName,
                        worldBook,
                        hasAvatar: true,
                        avatarUrl: inlineAvatarUrl,
                        size: stats.size,
                        updatedAt: stats.mtime.toISOString(),
                    };
                }
            } catch {
                // Keep fallback name for invalid files.
            }

            const avatarPath = resolveLocalAvatarPath(baseDir, userid, entry.name);
            const hasAvatar = !!avatarPath;

            return {
                fileName: entry.name,
                displayName,
                worldBook,
                hasAvatar,
                avatarUrl: hasAvatar ? `/api/characters/avatar/${encodeURIComponent(entry.name)}` : null,
                size: stats.size,
                updatedAt: stats.mtime.toISOString(),
            };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveCharacterAvatar(baseDir, userid, fileName, buffer) {
    const ext = detectImageExtFromBuffer(buffer);
    const avatarPath = getAvatarPathWithExt(baseDir, userid, fileName, ext);
    const oldPath = resolveLocalAvatarPath(baseDir, userid, fileName);
    if (oldPath && oldPath !== avatarPath && fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
    }
    fs.writeFileSync(avatarPath, buffer);
}

export function readCharacterAvatar(baseDir, userid, fileName) {
    const avatarPath = resolveLocalAvatarPath(baseDir, userid, fileName);
    if (avatarPath && fs.existsSync(avatarPath)) {
        return fs.readFileSync(avatarPath);
    }
    return null;
}

export function readCharacterCard(baseDir, userid, fileName) {
    const safeName = toSafeStoredFileName(fileName);
    const root = ensureCharactersRoot(baseDir, userid);
    const fullPath = path.join(root, safeName);

    if (!fs.existsSync(fullPath)) {
        throw new Error(t('characters.not_found'));
    }

    const jsonText = fs.readFileSync(fullPath, 'utf8');
    let parsed;

    try {
        parsed = JSON.parse(jsonText);
    } catch {
        throw new Error(t('characters.card_json_corrupted'));
    }

    return {
        fileName: safeName,
        name: resolveCardDisplayName('', parsed),
        description: String(parsed?.data?.description || parsed?.description || '').trim(),
        worldBook: getCardWorldBook(parsed),
        metaFields: getCharacterMeta(parsed),
        embeddedLoreEntries: (() => {
            const embedded = getEmbeddedCharacterBook(parsed);
            if (!embedded) {
                return [];
            }
            return embedded.entries.map((entry, index) => toCharacterBookEntryView(entry, index));
        })(),
        hasAvatar: !!(resolveInlineAvatarUrl(parsed) || resolveLocalAvatarPath(baseDir, userid, safeName)),
        avatarUrl: resolveInlineAvatarUrl(parsed) || (resolveLocalAvatarPath(baseDir, userid, safeName) ? `/api/characters/avatar/${encodeURIComponent(safeName)}` : null),
        jsonText,
        parsed,
    };
}

export function createCharacterCard(baseDir, userid, cardName, description, worldBook) {
    const cleanName = String(cardName || '').trim();
    if (!cleanName) {
        throw new Error(t('characters.name_empty'));
    }

    const root = ensureCharactersRoot(baseDir, userid);
    const safeBaseName = sanitizeCardFileName(cleanName);
    const { fileName, filePath } = makeUniqueFilePath(root, safeBaseName);

    const payload = {
        name: cleanName,
        description: String(description || '').trim(),
        first_mes: '',
        personality: '',
        scenario: '',
        mes_example: '',
        creator_notes: '',
        system_prompt: '',
        post_history_instructions: '',
        tags: [],
        alternate_greetings: [],
        spec: 'chara_card_v3',
        spec_version: '3.0',
        meta: {
            worldBook: String(worldBook || '').trim(),
        },
        data: {
            name: cleanName,
            description: String(description || '').trim(),
            first_mes: '',
            personality: '',
            scenario: '',
            mes_example: '',
            creator_notes: '',
            system_prompt: '',
            post_history_instructions: '',
            tags: [],
            alternate_greetings: [],
            meta: {
                worldBook: String(worldBook || '').trim(),
            },
            extensions: {},
        },
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));

    return {
        fileName,
        displayName: cleanName,
    };
}

export function updateCharacterCard(baseDir, userid, fileName, payload) {
    const card = readCharacterCard(baseDir, userid, fileName);

    let parsedFromText = null;
    const jsonText = String(payload.cardJson || '').trim();
    if (jsonText) {
        try {
            parsedFromText = JSON.parse(jsonText);
        } catch {
            throw new Error(t('characters.card_json_invalid'));
        }

        if (!parsedFromText || typeof parsedFromText !== 'object' || Array.isArray(parsedFromText)) {
            throw new Error(t('characters.card_json_not_object'));
        }
    }

    const finalCard = parsedFromText || card.parsed;
    const name = String(payload.cardName || '').trim();
    if (!name) {
        throw new Error(t('characters.name_empty'));
    }

    finalCard.name = name;
    finalCard.description = String(payload.description || '').trim();
    finalCard.first_mes = String(payload.firstMessage || '').trim();
    finalCard.personality = String(payload.personality || '').trim();
    finalCard.scenario = String(payload.scenario || '').trim();
    finalCard.mes_example = String(payload.messageExample || '').trim();
    finalCard.system_prompt = String(payload.systemPrompt || '').trim();
    finalCard.post_history_instructions = String(payload.postHistoryInstructions || '').trim();
    finalCard.creator_notes = String(payload.creatorNotes || '').trim();
    finalCard.tags = String(payload.tags || '').split(',').map((t) => t.trim()).filter((t) => t);
    finalCard.alternate_greetings = String(payload.alternateGreetings || '')
        .split(/\r?\n+/)
        .map((item) => item.trim())
        .filter(Boolean);
    
    const worldBookValue = payload.worldBook === undefined
        ? String(finalCard?.meta?.worldBook || finalCard?.worldBook || finalCard?.data?.meta?.worldBook || '').trim()
        : String(payload.worldBook || '').trim();

    finalCard.meta = {
        ...(finalCard.meta && typeof finalCard.meta === 'object' ? finalCard.meta : {}),
        worldBook: worldBookValue,
    };

    if (finalCard.data && typeof finalCard.data === 'object' && !Array.isArray(finalCard.data)) {
        finalCard.data.name = finalCard.name;
        finalCard.data.description = finalCard.description;
        finalCard.data.first_mes = finalCard.first_mes;
        finalCard.data.personality = finalCard.personality;
        finalCard.data.scenario = finalCard.scenario;
        finalCard.data.mes_example = finalCard.mes_example;
        finalCard.data.system_prompt = finalCard.system_prompt;
        finalCard.data.post_history_instructions = finalCard.post_history_instructions;
        finalCard.data.creator_notes = finalCard.creator_notes;
        finalCard.data.tags = finalCard.tags;
        finalCard.data.alternate_greetings = finalCard.alternate_greetings;
        finalCard.data.meta = {
            ...(finalCard.data.meta && typeof finalCard.data.meta === 'object' ? finalCard.data.meta : {}),
            worldBook: finalCard.meta.worldBook,
        };
    } else {
        finalCard.data = {
            name: finalCard.name,
            description: finalCard.description,
            first_mes: finalCard.first_mes,
            personality: finalCard.personality,
            scenario: finalCard.scenario,
            mes_example: finalCard.mes_example,
            system_prompt: finalCard.system_prompt,
            post_history_instructions: finalCard.post_history_instructions,
            creator_notes: finalCard.creator_notes,
            tags: finalCard.tags,
            alternate_greetings: finalCard.alternate_greetings,
            meta: {
                worldBook: finalCard.meta.worldBook,
            },
        };
    }

    const embeddedLoreJson = String(payload.embeddedLoreJson || '').trim();
    if (embeddedLoreJson) {
        let parsedEntries;
        try {
            parsedEntries = JSON.parse(embeddedLoreJson);
        } catch {
            throw new Error(t('characters.embedded_lore_invalid'));
        }
        if (!Array.isArray(parsedEntries)) {
            throw new Error(t('characters.embedded_lore_not_array'));
        }
        const normalizedEntries = parsedEntries.map((entry, index) => {
            const keys = Array.isArray(entry?.keys) ? entry.keys : [];
            const secondaryKeys = Array.isArray(entry?.secondaryKeys) ? entry.secondaryKeys : [];
            const order = Number(entry?.order);
            const position = Number(entry?.position);
            const depth = Number(entry?.depth);
            return {
                id: Number.isFinite(Number(entry?.uid)) ? Number(entry.uid) : index,
                keys: keys.map((item) => String(item || '').trim()).filter(Boolean),
                secondary_keys: secondaryKeys.map((item) => String(item || '').trim()).filter(Boolean),
                comment: String(entry?.comment || '').trim(),
                content: String(entry?.content || '').trim(),
                insertion_order: Number.isFinite(order) ? order : (100 + index),
                enabled: entry?.enabled === undefined ? true : !!entry.enabled,
                extensions: {
                    position: Number.isFinite(position) ? position : 1,
                    depth: Number.isFinite(depth) ? depth : 0,
                },
            };
        });

        const currentBook = getEmbeddedCharacterBook(finalCard) || {};
        const nextBook = {
            ...currentBook,
            name: String(currentBook?.name || finalCard.name || 'Embedded Lorebook'),
            entries: normalizedEntries,
        };
        finalCard.character_book = nextBook;
        if (finalCard.data && typeof finalCard.data === 'object' && !Array.isArray(finalCard.data)) {
            finalCard.data.character_book = nextBook;
        }
    }

    const root = ensureCharactersRoot(baseDir, userid);
    const fullPath = path.join(root, card.fileName);
    fs.writeFileSync(fullPath, JSON.stringify(finalCard, null, 2));

    return {
        fileName: card.fileName,
        displayName: finalCard.name,
    };
}

export function deleteCharacterCard(baseDir, userid, fileName) {
    const safeName = toSafeStoredFileName(fileName);
    const root = ensureCharactersRoot(baseDir, userid);
    const fullPath = path.join(root, safeName);

    // Delete linked worldbook file
    try {
        const jsonText = fs.readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(jsonText);
        const linkedWb = getCardWorldBook(parsed);
        if (linkedWb) {
            const wbPath = path.resolve(baseDir, 'data/users', userid, 'worldbooks', linkedWb);
            if (fs.existsSync(wbPath)) {
                fs.unlinkSync(wbPath);
            }
        }
    } catch {}

    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
    }

    const avatarPath = resolveLocalAvatarPath(baseDir, userid, fileName);
    if (avatarPath && fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
    }
}

export function importCharacterCard(baseDir, userid, cardName, cardJson) {
    const rawText = String(cardJson || '').trim();
    if (!rawText) {
        throw new Error(t('characters.card_empty'));
    }

    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        throw new Error(t('characters.card_not_valid_json'));
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(t('characters.card_not_object'));
    }

    const displayName = resolveCardDisplayName(cardName, parsed);
    if (!parsed.name && displayName !== 'Unnamed Character') {
        parsed.name = displayName;
    }
    if (!parsed.spec) {
        parsed.spec = 'chara_card_v3';
    }
    if (!parsed.spec_version) {
        parsed.spec_version = '3.0';
    }
    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
        parsed.data = {
            name: parsed.name || displayName,
            description: String(parsed.description || ''),
            personality: String(parsed.personality || ''),
            scenario: String(parsed.scenario || ''),
            first_mes: String(parsed.first_mes || ''),
            mes_example: String(parsed.mes_example || ''),
            creator_notes: String(parsed.creator_notes || ''),
            system_prompt: String(parsed.system_prompt || ''),
            post_history_instructions: String(parsed.post_history_instructions || ''),
            tags: Array.isArray(parsed.tags) ? parsed.tags : [],
            alternate_greetings: Array.isArray(parsed.alternate_greetings) ? parsed.alternate_greetings : [],
        };
    }

    let importedWorldBookFile = '';
    const embeddedBook = getEmbeddedCharacterBook(parsed);
    if (embeddedBook) {
        const convertedWorldBook = convertCharacterBookToWorldBook(embeddedBook);
        const worldBookName = convertedWorldBook.name || `${displayName}_lorebook`;
        importedWorldBookFile = saveImportedWorldBookFromCharacter(baseDir, userid, worldBookName, convertedWorldBook);

        parsed.meta = {
            ...(parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {}),
            worldBook: importedWorldBookFile,
        };
        parsed.worldBook = importedWorldBookFile;
    }

    const root = ensureCharactersRoot(baseDir, userid);
    const safeBaseName = sanitizeCardFileName(displayName);
    const { fileName, filePath } = makeUniqueFilePath(root, safeBaseName);

    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2));

    return {
        fileName,
        displayName,
        importedWorldBookFile,
    };
}
