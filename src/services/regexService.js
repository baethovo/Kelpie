import { readCharacterCard } from './characterService.js';
import { readPreset } from './presetService.js';
import { t } from '../i18n.js';

function safeString(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
}

function escapeRegex(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRegexFlags(rawFlags, fallback = 'g') {
    const unique = [...new Set(String(rawFlags || fallback).split(''))];
    return unique.filter((flag) => /[dgimsuvy]/.test(flag)).join('') || fallback;
}

function toBoolean(value, fallback = false) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    if (typeof value === 'string') {
        const clean = value.trim().toLowerCase();
        if (clean === '1' || clean === 'true') return true;
        if (clean === '0' || clean === 'false') return false;
    }
    return fallback;
}

function normalizePlacement(rule) {
    const placement = rule?.placement;
    if (Array.isArray(placement)) {
        return placement.map((item) => Number(item)).filter((item) => Number.isFinite(item));
    }
    if (placement === null || placement === undefined || placement === '') {
        return [];
    }
    const text = String(placement).trim().toLowerCase();
    if (text === 'assistant' || text === 'assistant_output' || text === 'ai' || text === 'bot' || text === 'output') {
        return [2];
    }
    const parsed = Number(text);
    if (Number.isFinite(parsed)) {
        return [parsed];
    }
    return [];
}

function hasHtmlLikeContent(text) {
    const source = String(text || '');
    if (!source) {
        return false;
    }
    return /<(style|script|div|span|details|summary|table|img|svg|iframe)\b/i.test(source) || /<\/[a-z][^>]*>/i.test(source);
}

function resolveStagesForScriptRule(rule, replacement, ruleName = '') {
    const stages = new Set();
    const placements = normalizePlacement(rule);
    const markdownOnly = toBoolean(rule.markdownOnly, false);
    const promptOnly = toBoolean(rule.promptOnly, false);

    if (markdownOnly && !promptOnly) {
        stages.add('display');
    } else if (!markdownOnly && promptOnly) {
        stages.add('outgoing');
    } else {
        stages.add('incoming');
        stages.add('display');
    }

    if (!stages.size) {
        stages.add('incoming');
    }

    return [...stages];
}

function stageLabel(stage) {
    if (stage === 'display') return t('regex.display');
    if (stage === 'outgoing') return t('regex.prompt_only');
    if (stage === 'incoming') return t('regex.all_replace');
    return stage;
}

function placementLabel(placementValue) {
    const map = {
        1: t('regex.scope_user_input'),
        2: t('regex.scope_ai_output'),
        3: t('regex.scope_slash'),
        5: t('regex.scope_worldinfo'),
        6: t('regex.scope_reasoning'),
    };
    return map[placementValue] || String(placementValue);
}

function readCharacterRegexScripts(characterCard) {
    const parsed = characterCard?.parsed || {};
    const candidates = [
        parsed?.extensions?.regex_scripts,
        parsed?.data?.extensions?.regex_scripts,
        parsed?.regex_scripts,
        parsed?.data?.regex_scripts,
    ];
    for (const item of candidates) {
        if (Array.isArray(item)) {
            return item;
        }
    }
    return [];
}

function readPresetRegexScripts(preset) {
    const candidates = [
        preset?.extensions?.regex_scripts,
        preset?.regex_scripts,
        preset?.extensions?.RegexBinding?.regexes,
    ];
    for (const item of candidates) {
        if (Array.isArray(item)) {
            return item;
        }
    }
    return [];
}

function parsePatternAndFlags(rawPattern, rawFlags = '', fallbackFlags = 'g') {
    const source = String(rawPattern || '');
    const literalMatch = source.match(/^\/([\s\S]*)\/([a-z]*)$/i);
    if (literalMatch) {
        return {
            pattern: literalMatch[1],
            flags: normalizeRegexFlags(literalMatch[2] || rawFlags || fallbackFlags, fallbackFlags),
        };
    }
    return {
        pattern: source,
        flags: normalizeRegexFlags(rawFlags || fallbackFlags, fallbackFlags),
    };
}

function isStScriptRuleEnabled(rule) {
    if (!rule || typeof rule !== 'object') {
        return false;
    }
    if (toBoolean(rule.disabled, false) === true) {
        return false;
    }
    if (rule.enabled === false) {
        return false;
    }
    const pattern = safeString(rule.findRegex || rule.pattern);
    if (!pattern) {
        return false;
    }
    const placements = normalizePlacement(rule);
    const promptOnly = toBoolean(rule.promptOnly, false);
    const markdownOnly = toBoolean(rule.markdownOnly, false);
    if (!promptOnly && !markdownOnly && placements.length && !placements.some(p => p >= 1 && p <= 6)) {
        return false;
    }
    return true;
}

function normalizeStScriptRules(scripts, source) {
    return scripts
        .map((rule, index) => {
            if (!isStScriptRuleEnabled(rule)) {
                return null;
            }
            const parsed = parsePatternAndFlags(rule.findRegex || rule.pattern, rule.flags, 'g');
            if (!parsed.pattern) {
                return null;
            }
            const rawPattern = safeString(rule.findRegex || rule.pattern);
            const useRegex = toBoolean(rule.use_regex, true);
            const ruleName = safeString(rule.scriptName || rule.name, `Character Rule ${index + 1}`);
            const replacement = String(rule.replaceString ?? rule.replacement ?? '');
            const stages = resolveStagesForScriptRule(rule, replacement, ruleName);
            const pattern = useRegex ? parsed.pattern : escapeRegex(rawPattern);
            const placement = normalizePlacement(rule);
            return {
                id: `${source}_${index}`,
                source,
                name: ruleName,
                pattern,
                replacement,
                flags: useRegex ? parsed.flags : 'g',
                substituteRegex: toBoolean(rule.substituteRegex, true),
                stages,
                placement,
                markdownOnly: toBoolean(rule.markdownOnly, false),
                promptOnly: toBoolean(rule.promptOnly, false),
                runOnEdit: toBoolean(rule.runOnEdit, false),
                minDepth: typeof rule.minDepth === 'number' ? rule.minDepth : null,
                maxDepth: typeof rule.maxDepth === 'number' ? rule.maxDepth : null,
            };
        })
        .filter(Boolean);
}

function normalizePresetRules(preset) {
    const postRules = Array.isArray(preset?.postProcessing?.regex) ? preset.postProcessing.regex : [];
    const normalizedPostRules = postRules
        .map((rule, index) => {
            if (!rule || typeof rule !== 'object') {
                return null;
            }
            if (rule.enabled === false || rule.disabled === true) {
                return null;
            }
            const parsed = parsePatternAndFlags(rule.pattern, rule.flags, 'g');
            if (!parsed.pattern) {
                return null;
            }
            return {
                id: `preset_post_${index}`,
                source: 'preset',
                name: safeString(rule?.name, `Preset Rule ${index + 1}`),
                pattern: parsed.pattern,
                replacement: String(rule?.replacement ?? ''),
                flags: parsed.flags,
                substituteRegex: true,
                stages: ['incoming'],
            };
        })
        .filter(Boolean);

    const stPresetRules = normalizeStScriptRules(readPresetRegexScripts(preset), 'preset');
    return [...normalizedPostRules, ...stPresetRules];
}

function normalizeCharacterRules(characterCard) {
    return normalizeStScriptRules(readCharacterRegexScripts(characterCard), 'character');
}

function applyRegexRules(content, rules) {
    let output = String(content || '');
    let applied = 0;
    const appliedRules = [];
    for (const rule of rules) {
        try {
            const regex = new RegExp(rule.pattern, rule.flags);
            const next = output.replace(regex, rule.replacement);
            if (next !== output) {
                applied += 1;
                appliedRules.push(rule.id);
                output = next;
            }
        } catch {
            // Ignore invalid regex rule to keep generation stable.
        }
    }
    return {
        content: String(output || '').trim(),
        applied,
        appliedRules,
    };
}

function buildRuleView(rule) {
    const stages = Array.isArray(rule.stages) && rule.stages.length ? rule.stages : ['incoming'];
    const placement = Array.isArray(rule.placement) ? rule.placement : [];
    return {
        id: rule.id,
        source: rule.source,
        name: rule.name,
        pattern: rule.pattern,
        replacement: rule.replacement,
        flags: rule.flags,
        substituteRegex: !!rule.substituteRegex,
        stages,
        stageLabels: stages.map(stageLabel),
        placement,
        placementLabels: placement.map(placementLabel),
        markdownOnly: !!rule.markdownOnly,
        promptOnly: !!rule.promptOnly,
        runOnEdit: !!rule.runOnEdit,
        minDepth: rule.minDepth,
        maxDepth: rule.maxDepth,
    };
}

export function buildSessionRegexState(baseDir, session) {
    if (!session) {
        return {
            currentPresetFile: '',
            currentPresetName: t('regex.default_config'),
            rules: [],
            ruleViews: [],
        };
    }

    let preset = null;
    if (session.presetFile) {
        try {
            preset = readPreset(baseDir, session.hostUserid, 'api', session.presetFile)?.parsed || null;
        } catch {
            preset = null;
        }
    }

    let characterCard = null;
    try {
        characterCard = readCharacterCard(baseDir, session.hostUserid, session.characterFile);
    } catch {
        characterCard = null;
    }

    const presetRules = normalizePresetRules(preset);
    const characterRules = normalizeCharacterRules(characterCard);
    const mergedRules = [...presetRules, ...characterRules];

    return {
        currentPresetFile: String(session.presetFile || ''),
        currentPresetName: safeString(preset?.name, '默认参数'),
        rules: mergedRules,
        ruleViews: mergedRules.map(buildRuleView),
    };
}

export function applySessionRegexByStage(content, regexState, stage = 'incoming') {
    const rules = Array.isArray(regexState?.rules) ? regexState.rules : [];
    const scopedRules = rules.filter((rule) => {
        const stages = Array.isArray(rule?.stages) && rule.stages.length ? rule.stages : ['incoming'];
        if (stage === 'display') return stages.includes('display');
        if (stage === 'outgoing') return stages.includes('outgoing');
        if (stage === 'slash') return stages.includes('incoming') && (Array.isArray(rule.placement) ? rule.placement.includes(3) : false);
        if (stage === 'worldinfo') return stages.includes('incoming') && (Array.isArray(rule.placement) ? rule.placement.includes(5) : false);
        if (stage === 'reasoning') return stages.includes('incoming') && (Array.isArray(rule.placement) ? rule.placement.includes(6) : false);
        return stages.includes(stage);
    });
    if (!scopedRules.length) {
        return {
            content: String(content || '').trim(),
            applied: 0,
            appliedRules: [],
        };
    }
    return applyRegexRules(content, scopedRules);
}

export function applySessionRegexPostProcessing(content, regexState) {
    const rules = Array.isArray(regexState?.rules) ? regexState.rules : [];
    if (!rules.length) {
        return {
            content: String(content || '').trim(),
            applied: 0,
            appliedRules: [],
        };
    }
    return applySessionRegexByStage(content, regexState, 'incoming');
}
