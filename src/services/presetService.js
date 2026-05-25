import fs from 'node:fs';
import path from 'node:path';
import { getDefaultSillyTavernPresetTemplate } from './sillyTavernService.js';
import { t } from '../i18n.js';

const PRESET_TYPES = [
    { id: 'api', label: '生成式 AI 对话预设（OpenAI）' },
];

const DEFAULT_PRESET_TEMPLATE = getDefaultSillyTavernPresetTemplate();
const DEFAULT_PRESETS = {
    api: DEFAULT_PRESET_TEMPLATE,
};

function getPresetsRoot(baseDir, userid) {
    return path.resolve(baseDir, 'data/users', userid, 'presets');
}

function getTypeFolder(baseDir, userid, apiId) {
    return path.join(getPresetsRoot(baseDir, userid), apiId);
}

function ensureTypeFolder(baseDir, userid, apiId) {
    const folder = getTypeFolder(baseDir, userid, apiId);
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }

    return folder;
}

function normalizeApiId(apiId) {
    const normalized = String(apiId || '').trim().toLowerCase();
    if (!PRESET_TYPES.some((item) => item.id === normalized)) {
        throw new Error(t('presets.unsupported_type'));
    }
    return normalized;
}

function isObjectPreset(parsed) {
    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
}

function sanitizeBaseName(name) {
    const normalized = String(name || '')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // Remove illegal filename characters
        .replace(/[. ]+$/g, ''); // Remove trailing dots and spaces
    return normalized || 'preset';
}

function makeUniquePath(folder, baseName) {
    let fileName = `${baseName}.json`;
    let filePath = path.join(folder, fileName);
    let index = 1;

    while (fs.existsSync(filePath)) {
        fileName = `${baseName}_${index}.json`;
        filePath = path.join(folder, fileName);
        index += 1;
    }

    return { fileName, filePath };
}

function toSafeFileName(fileName) {
    const normalized = path.basename(String(fileName || '').trim());
    if (!normalized || path.extname(normalized).toLowerCase() !== '.json') {
        throw new Error(t('presets.invalid_filename'));
    }
    return normalized;
}

function getDisplayName(fileName, parsed) {
    const fromParsed = String(parsed?.name || '').trim();
    if (fromParsed) {
        return fromParsed;
    }
    return String(fileName).replace(/\.json$/i, '');
}

function parsePresetJson(rawJson) {
    const clean = String(rawJson || '').replace(/^\uFEFF/, '').trim();
    if (!clean) {
        throw new Error(t('presets.content_empty'));
    }

    let parsed;
    try {
        parsed = JSON.parse(clean);
    } catch {
        throw new Error(t('presets.json_invalid'));
    }

    if (!isObjectPreset(parsed)) {
        throw new Error(t('presets.json_not_object'));
    }

    return parsed;
}

function isObjectValue(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asObject(value) {
    return isObjectValue(value) ? value : {};
}

function normalizePresetObject(parsed, fallbackName = '') {
    const raw = asObject(parsed);
    const template = getDefaultSillyTavernPresetTemplate();
    const sectionKeys = ['openai', 'context', 'instruct', 'sysprompt', 'postProcessing'];
    const hasNamedSection = sectionKeys.some((key) => isObjectValue(raw[key]));
    
    const openaiSource = hasNamedSection ? asObject(raw.openai) : raw;
    const resolvedOpenaiModel = String(
        openaiSource.openai_model
        || openaiSource.model
        || raw.openai_model
        || raw.model
        || '',
    ).trim();
    const normalizedOpenai = {
        ...template.openai,
        ...openaiSource,
        ...asObject(openaiSource.settings),
    };
    delete normalizedOpenai.settings;
    if (resolvedOpenaiModel) {
        normalizedOpenai.openai_model = resolvedOpenaiModel;
    }

    // Ensure prompts is an array (SillyTavern-compatible shape)
    if (!Array.isArray(normalizedOpenai.prompts)) {
        normalizedOpenai.prompts = Array.isArray(template.openai.prompts) ? [...template.openai.prompts] : [];
    } else {
        normalizedOpenai.prompts = normalizedOpenai.prompts
            .filter((item) => isObjectValue(item))
            .map((item) => ({ ...item }));
    }

    // Ensure prompt_order is present and valid
    if (!Array.isArray(normalizedOpenai.prompt_order) || !normalizedOpenai.prompt_order.length) {
        normalizedOpenai.prompt_order = Array.isArray(template.openai.prompt_order)
            ? JSON.parse(JSON.stringify(template.openai.prompt_order))
            : [];
    } else {
        normalizedOpenai.prompt_order = normalizedOpenai.prompt_order
            .filter((item) => isObjectValue(item))
            .map((item) => {
                const orderList = Array.isArray(item.order)
                    ? item.order.filter((entry) => isObjectValue(entry)).map((entry) => ({ ...entry }))
                    : [];
                return {
                    ...item,
                    order: orderList,
                };
            });
    }

    const normalized = {
        ...template,
        ...raw,
        name: String(raw.name || fallbackName || template.name || 'SillyTavern-Preset').trim(),
        openai: normalizedOpenai,
        context: {
            ...template.context,
            ...asObject(raw.context),
        },
        instruct: {
            ...template.instruct,
            ...asObject(raw.instruct),
        },
        sysprompt: {
            ...template.sysprompt,
            ...asObject(raw.sysprompt),
        },
        postProcessing: {
            ...template.postProcessing,
            ...asObject(raw.postProcessing),
        },
    };

    return normalized;
}

function stringifyPreset(parsed, fallbackName = '') {
    return JSON.stringify(normalizePresetObject(parsed, fallbackName), null, 2);
}

export function listPresetTypes() {
    return PRESET_TYPES;
}

export function listPresets(baseDir, userid, apiId) {
    const safeApiId = normalizeApiId(apiId);
    const folder = ensureTypeFolder(baseDir, userid, safeApiId);

    return fs.readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const fullPath = path.join(folder, entry.name);
            const stats = fs.statSync(fullPath);
            let parsed = null;

            try {
                parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            } catch {
                parsed = null;
            }

            if (!isObjectPreset(parsed)) {
                return null;
            }

            const normalized = normalizePresetObject(parsed);

            return {
                fileName: entry.name,
                displayName: getDisplayName(entry.name, normalized),
                updatedAt: stats.mtime.toISOString(),
                size: stats.size,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function readPreset(baseDir, userid, apiId, fileName) {
    const safeApiId = normalizeApiId(apiId);
    const safeFileName = toSafeFileName(fileName);
    const folder = ensureTypeFolder(baseDir, userid, safeApiId);
    const filePath = path.join(folder, safeFileName);

    if (!fs.existsSync(filePath)) {
        throw new Error(t('presets.not_found'));
    }

    const jsonText = fs.readFileSync(filePath, 'utf8');
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch {
        throw new Error(t('presets.not_valid_json'));
    }
    if (!isObjectPreset(parsed)) {
        throw new Error(t('presets.json_not_object'));
    }

    const normalized = normalizePresetObject(parsed, String(safeFileName).replace(/\.json$/i, ''));
    const normalizedJsonText = JSON.stringify(normalized, null, 2);

    return {
        apiId: safeApiId,
        fileName: safeFileName,
        displayName: getDisplayName(safeFileName, normalized),
        jsonText: normalizedJsonText,
        parsed: normalized,
    };
}

export function importPresetFromFile(baseDir, userid, apiId, sourceName, rawJson) {
    const safeApiId = normalizeApiId(apiId);
    const parsed = parsePresetJson(rawJson);

    const sourceBaseName = path.basename(String(sourceName || ''), path.extname(String(sourceName || '')));
    const importName = sourceBaseName || 'preset';
    const folder = ensureTypeFolder(baseDir, userid, safeApiId);
    
    // Ensure unique filename
    const { fileName, filePath } = makeUniquePath(folder, sanitizeBaseName(importName));
    
    fs.writeFileSync(filePath, stringifyPreset(parsed, importName));

    const normalized = normalizePresetObject(parsed, importName);

    return {
        apiId: safeApiId,
        fileName,
        displayName: getDisplayName(fileName, normalized),
    };
}

export function savePreset(baseDir, userid, apiId, presetName, presetJson) {
    const safeApiId = normalizeApiId(apiId);
    const name = String(presetName || '').trim();
    const rawJson = String(presetJson || '').trim();

    if (!name) {
        throw new Error(t('presets.name_empty'));
    }
    if (!rawJson) {
        throw new Error(t('presets.content_empty'));
    }

    const parsed = parsePresetJson(rawJson);

    const folder = ensureTypeFolder(baseDir, userid, safeApiId);
    const fileName = `${sanitizeBaseName(name)}.json`;
    const filePath = path.join(folder, fileName);
    fs.writeFileSync(filePath, stringifyPreset(parsed, name));

    return {
        apiId: safeApiId,
        fileName,
        displayName: name,
    };
}

export function createPreset(baseDir, userid, apiId, presetName) {
    const safeApiId = normalizeApiId(apiId);
    const name = String(presetName || '').trim();
    if (!name) {
        throw new Error(t('presets.name_empty'));
    }

    const folder = ensureTypeFolder(baseDir, userid, safeApiId);
    const { fileName, filePath } = makeUniquePath(folder, sanitizeBaseName(name));
    const template = {
        ...(DEFAULT_PRESETS[safeApiId] || {}),
        name,
    };

    fs.writeFileSync(filePath, JSON.stringify(template, null, 2));

    return {
        apiId: safeApiId,
        fileName,
        displayName: name,
    };
}

export function deletePreset(baseDir, userid, apiId, fileName) {
    const safeApiId = normalizeApiId(apiId);
    const safeFileName = toSafeFileName(fileName);
    const folder = ensureTypeFolder(baseDir, userid, safeApiId);
    const filePath = path.join(folder, safeFileName);

    if (!fs.existsSync(filePath)) {
        throw new Error(t('presets.not_found'));
    }

    fs.unlinkSync(filePath);
}

export function restoreDefaultPreset(baseDir, userid, apiId, fileName) {
    const safeApiId = normalizeApiId(apiId);
    const safeFileName = toSafeFileName(fileName);
    const folder = ensureTypeFolder(baseDir, userid, safeApiId);
    const filePath = path.join(folder, safeFileName);

    if (!fs.existsSync(filePath)) {
        throw new Error(t('presets.not_found'));
    }

    const template = DEFAULT_PRESETS[safeApiId];
    if (!template) {
        throw new Error(t('presets.no_default_template'));
    }

    const current = readPreset(baseDir, userid, safeApiId, safeFileName);
    const restored = {
        ...template,
        name: current.displayName,
    };

    fs.writeFileSync(filePath, JSON.stringify(restored, null, 2));

    return {
        apiId: safeApiId,
        fileName: safeFileName,
        displayName: current.displayName,
    };
}
