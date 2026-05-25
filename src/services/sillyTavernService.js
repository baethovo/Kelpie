import { t } from '../i18n.js';

function safeString(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
}

function safeNumber(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function estimateTokens(text) {
    return Math.max(1, Math.ceil(String(text || '').length / 4));
}

function renderVars(template, vars) {
    let text = String(template || '');
    let previous = '';
    let pass = 0;
    
    const lowerVars = {};
    for (const [k, v] of Object.entries(vars || {})) {
        lowerVars[k.toLowerCase()] = v;
    }

    while (text !== previous && pass < 10) {
        previous = text;
        text = text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
            const lowerKey = key.toLowerCase();
            if (lowerKey === 'trim') return match; // Leave {{trim}} for later if used
            return lowerVars[lowerKey] !== undefined ? String(lowerVars[lowerKey]) : '';
        });
        pass += 1;
    }
    return text;
}

function renderContextStoryString(template, values) {
    let text = String(template || '');
    
    const lowerValues = {};
    for (const [k, v] of Object.entries(values || {})) {
        lowerValues[k.toLowerCase()] = v;
    }

    text = text.replace(/\{\{#if ([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/if\}\}/gi, (_all, key, content) => {
        return lowerValues[key.toLowerCase()] ? content : '';
    });

    let previous = '';
    let pass = 0;
    while (text !== previous && pass < 10) {
        previous = text;
        text = text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
            const lowerKey = key.toLowerCase();
            if (lowerKey === 'trim') return match;
            return lowerValues[lowerKey] !== undefined ? String(lowerValues[lowerKey]) : '';
        });
        pass += 1;
    }

    text = text.replace(/\{\{trim\}\}/gi, '').trim();
    return text;
}

function toPromptOrder(openaiPreset) {
    const order = openaiPreset?.prompt_order;
    if (Array.isArray(order) && order.length && Array.isArray(order[0]?.order)) {
        const candidate = order.find((item) => Array.isArray(item?.order));
        if (candidate) {
            return candidate.order;
        }
    }
    if (Array.isArray(order)) {
        return order;
    }
    return [
        { identifier: 'main', enabled: true },
        { identifier: 'worldInfoBefore', enabled: true },
        { identifier: 'charDescription', enabled: true },
        { identifier: 'charPersonality', enabled: true },
        { identifier: 'scenario', enabled: true },
        { identifier: 'nsfw', enabled: true },
        { identifier: 'worldInfoAfter', enabled: true },
        { identifier: 'chatHistory', enabled: true },
        { identifier: 'jailbreak', enabled: true },
    ];
}

function toPromptMap(openaiPreset) {
    const map = new Map();
    const prompts = Array.isArray(openaiPreset?.prompts) ? openaiPreset.prompts : [];
    prompts.forEach((item) => {
        if (item?.identifier) {
            map.set(String(item.identifier), item);
        }
    });
    return map;
}

function normalizeWorldBookEntries(worldBook) {
    const rawEntries = worldBook?.parsed?.entries;
    if (!rawEntries || typeof rawEntries !== 'object') {
        return [];
    }

    const entries = Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries);

    const normalizePosition = (rawPosition) => {
        const numeric = Number(rawPosition);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
        const text = safeString(rawPosition).toLowerCase();
        if (!text) return 1;
        if (text === 'before_char' || text === 'beforecharacter') return 0;
        if (text === 'after_char' || text === 'aftercharacter') return 1;
        if (text === 'author_note_top' || text === 'an_top' || text === 'authors_note_top') return 2;
        if (text === 'author_note_bottom' || text === 'an_bottom' || text === 'authors_note_bottom') return 3;
        if (text === 'at_depth' || text === 'depth') return 4;
        if (text === 'chat_top') return 5;
        if (text === 'chat_bottom') return 6;
        return 1;
    };

    return entries
        .map((entry) => {
            const normalizeKeys = (val) => {
                if (Array.isArray(val)) return val.filter(Boolean).map((item) => String(item));
                if (typeof val === 'string') return val.split(',').map((item) => item.trim()).filter(Boolean);
                return [];
            };
            const keys = normalizeKeys(entry?.key || entry?.keys);
            const secondary = normalizeKeys(entry?.keysecondary || entry?.secondary_keys);
            const position = normalizePosition(entry?.position ?? entry?.extensions?.position);
            const scanDepth = safeNumber(entry?.scanDepth ?? entry?.extensions?.scan_depth, 0);
            return {
                uid: entry?.uid,
                keys: keys.filter(Boolean).map((item) => String(item)),
                secondaryKeys: secondary.filter(Boolean).map((item) => String(item)),
                content: safeString(entry?.content),
                order: safeNumber(entry?.order ?? entry?.insertion_order, 100),
                selectiveLogic: safeNumber(entry?.selectiveLogic ?? entry?.extensions?.selectiveLogic, 0),
                constant: !!entry?.constant,
                enabled: entry?.disable !== true && entry?.enabled !== false,
                position,
                depth: safeNumber(entry?.depth ?? entry?.extensions?.depth, 0),
                probability: safeNumber(entry?.probability ?? entry?.extensions?.probability, 100),
                scanDepth,
                caseSensitive: entry?.caseSensitive ?? entry?.extensions?.case_sensitive ?? false,
                matchWholeWords: entry?.matchWholeWords ?? entry?.extensions?.match_whole_words ?? false,
                useGroupScoring: entry?.useGroupScoring ?? entry?.extensions?.use_group_scoring ?? false,
                group: safeString(entry?.group ?? entry?.extensions?.group),
                groupOverride: !!(entry?.groupOverride ?? entry?.extensions?.group_override),
                groupWeight: safeNumber(entry?.groupWeight ?? entry?.extensions?.group_weight, 100),
                sticky: safeNumber(entry?.sticky ?? entry?.extensions?.sticky, 0),
                cooldown: safeNumber(entry?.cooldown ?? entry?.extensions?.cooldown, 0),
                delay: safeNumber(entry?.delay ?? entry?.extensions?.delay, 0),
                excludeRecursion: !!entry?.excludeRecursion,
                delayUntilRecursion: !!entry?.delayUntilRecursion,
                preventRecursion: !!entry?.preventRecursion,
                ignoreBudget: !!entry?.ignoreBudget,
                role: safeNumber(entry?.role ?? entry?.extensions?.role, 0),
                outletName: safeString(entry?.outletName),
            };
        })
        .filter((entry) => entry.enabled && entry.content);
}

function escapeRegex(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesNeedle(haystack, needle, options = {}) {
    const leftRaw = String(haystack || '');
    const rightRaw = String(needle || '').trim();
    if (!rightRaw) return false;

    const caseSensitive = !!options.caseSensitive;
    const matchWholeWords = !!options.matchWholeWords;
    const left = caseSensitive ? leftRaw : leftRaw.toLowerCase();
    const right = caseSensitive ? rightRaw : rightRaw.toLowerCase();

    if (!matchWholeWords) {
        return left.includes(right);
    }

    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(`(^|\\W)${escapeRegex(rightRaw)}(?=\\W|$)`, flags);
    return regex.test(leftRaw);
}

function resolveHistoryScanText(history, scanDepth) {
    const safeHistory = Array.isArray(history) ? history : [];
    const depth = safeNumber(scanDepth, 0);
    if (depth <= 0) {
        return safeHistory.map((item) => String(item?.content || '')).join('\n');
    }
    return safeHistory
        .slice(-depth)
        .map((item) => String(item?.content || ''))
        .join('\n');
}

function evaluateWorldInfo(worldBook, options = {}) {
    const {
        history,
        roundInputText,
        wiFormat,
        openaiPreset,
    } = options;
    const entries = normalizeWorldBookEntries(worldBook);
    const recursiveEnabled = openaiPreset?.world_info_recursive !== false;
    const recursionLimit = Math.max(1, safeNumber(openaiPreset?.world_info_recursion_limit, 4));
    const budgetPercent = Math.max(5, Math.min(100, safeNumber(openaiPreset?.world_info_budget, 25)));
    const maxContext = safeNumber(openaiPreset?.openai_max_context, 4095);
    const wiTokenBudget = Math.max(64, Math.floor(maxContext * (budgetPercent / 100)));

    const historyText = resolveHistoryScanText(history, safeNumber(openaiPreset?.world_info_scan_depth, 0));
    const baseScanText = [historyText, String(roundInputText || '').trim()].filter(Boolean).join('\n');
    const activated = new Map();
    let recursiveScanText = '';

    for (let pass = 0; pass < recursionLimit; pass += 1) {
        const currentScanText = [baseScanText, recursiveScanText].filter(Boolean).join('\n');
        let passMatchedCount = 0;

        for (const entry of entries) {
            const uid = entry.uid ?? `${entry.order}_${entry.content.slice(0, 16)}`;
            if (activated.has(uid)) continue;
            if (pass === 0 && entry.delayUntilRecursion) continue;
            if (pass > 0 && entry.excludeRecursion) continue;
            if (entry.delay > pass) continue;

            if (entry.probability < 100) {
                const dice = Math.random() * 100;
                if (dice > entry.probability) continue;
            }

            const entryScanText = entry.scanDepth > 0
                ? [resolveHistoryScanText(history, entry.scanDepth), String(roundInputText || '').trim(), recursiveScanText].filter(Boolean).join('\n')
                : currentScanText;

            const matchOptions = {
                caseSensitive: !!entry.caseSensitive,
                matchWholeWords: !!entry.matchWholeWords,
            };
            const primaryMatches = entry.keys.filter((item) => includesNeedle(entryScanText, item, matchOptions));
            const secondaryMatches = entry.secondaryKeys.filter((item) => includesNeedle(entryScanText, item, matchOptions));
            const hasPrimary = entry.keys.length > 0;
            const hasSecondary = entry.secondaryKeys.length > 0;

            let matched = false;
            if (entry.constant) {
                matched = true;
            } else if (!hasPrimary) {
                matched = false;
            } else {
                const primaryOk = primaryMatches.length > 0;
                const anySecondary = secondaryMatches.length > 0;
                const allSecondary = hasSecondary ? secondaryMatches.length === entry.secondaryKeys.length : true;
                switch (entry.selectiveLogic) {
                    case 1: matched = primaryOk && !allSecondary; break;
                    case 2: matched = primaryOk && !anySecondary; break;
                    case 3: matched = primaryOk && allSecondary; break;
                    case 0:
                    default: matched = primaryOk && (!hasSecondary || anySecondary); break;
                }
            }

            if (!matched) continue;

            const formatted = String(wiFormat || '{0}').replace(/\{0\}/g, entry.content);
            const activatedEntry = { ...entry, uid, text: formatted };
            activated.set(uid, activatedEntry);
            passMatchedCount += 1;

            if (!entry.preventRecursion) {
                recursiveScanText += `\n${entry.content}`;
            }
        }

        if (!recursiveEnabled || passMatchedCount === 0) {
            break;
        }
    }

    const activatedList = [...activated.values()];
    const grouped = new Map();
    const ungrouped = [];
    activatedList.forEach((entry) => {
        const groupName = safeString(entry.group);
        if (!groupName || entry.groupOverride) {
            ungrouped.push(entry);
            return;
        }
        const current = grouped.get(groupName);
        if (!current) {
            grouped.set(groupName, entry);
            return;
        }
        const scoreCurrent = safeNumber(current.groupWeight, 100) + safeNumber(current.order, 100) / 1000;
        const scoreNext = safeNumber(entry.groupWeight, 100) + safeNumber(entry.order, 100) / 1000;
        if (scoreNext > scoreCurrent) {
            grouped.set(groupName, entry);
        }
    });
    const triggered = [...ungrouped, ...grouped.values()].sort((a, b) => b.order - a.order);

    const budgetGroups = {
        before: [],
        after: [],
        top: [],
        bottom: [],
        depth: [],
    };
    let usedTokens = 0;
    triggered.forEach((item) => {
        const itemTokens = estimateTokens(item.text);
        const overBudget = usedTokens + itemTokens > wiTokenBudget;
        if (overBudget && !item.ignoreBudget) {
            return;
        }
        usedTokens += itemTokens;

        if (item.position === 0) budgetGroups.before.push(item.text);
        else if (item.position === 1) budgetGroups.after.push(item.text);
        else if (item.position === 4) budgetGroups.depth.push(item); // at_depth only
        else if (item.position === 5 || item.position === 2) budgetGroups.top.push(item.text); // chat_top / author_note_top
        else if (item.position === 3 || item.position === 6 || item.position === 7) budgetGroups.bottom.push(item.text);
        else budgetGroups.after.push(item.text);
    });

    return {
        before: budgetGroups.before.join('\n'),
        after: budgetGroups.after.join('\n'),
        top: budgetGroups.top.join('\n'),
        bottom: budgetGroups.bottom.join('\n'),
        depthEntries: budgetGroups.depth,
        triggeredIds: triggered.map((item) => item.uid).filter((item) => item !== undefined),
        triggeredCount: triggered.length,
        tokenBudget: wiTokenBudget,
        tokenUsed: usedTokens,
    };
}

function toHistoryMessages(history) {
    const ROOM_EVENT_SOURCES_TO_SKIP = new Set(['system_join', 'system_leave']);
    return history
        .filter((item) => !ROOM_EVENT_SOURCES_TO_SKIP.has(String(item?.meta?.source || '')))
        .map((item) => {
            if (item.speakerType === 'ai') {
                return { role: 'assistant', content: item.content, isHistory: true };
            }
            if (item.speakerType === 'player') {
                return { role: 'user', content: `${item.username || '玩家'}: ${item.content}`, isHistory: true };
            }
            return { role: 'system', content: item.content, isHistory: true };
        });
}

// injectDepthMessages removed — logic is handled inline in runSillyTavernChatCompletion

function historyContainsRoundInputs(history, roundPlayerInputs) {
    const inputs = (Array.isArray(roundPlayerInputs) ? roundPlayerInputs : [])
        .map((item) => ({
            username: safeString(item?.username),
            lastInput: safeString(item?.lastInput),
        }))
        .filter((item) => item.username && item.lastInput);
    if (!inputs.length) {
        return false;
    }

    const playerHistory = (Array.isArray(history) ? history : [])
        .filter((item) => item?.speakerType === 'player')
        .map((item) => ({
            username: safeString(item?.username),
            content: safeString(item?.content),
        }));
    const combinedCurrent = inputs.map((item) => `${item.username}: ${item.lastInput}`).join('\n\n');
    if (playerHistory.length > 0) {
        const last = playerHistory[playerHistory.length - 1];
        if (last.content === combinedCurrent) {
            return true;
        }
    }

    if (playerHistory.length < inputs.length) {
        return false;
    }

    const tail = playerHistory.slice(-inputs.length);
    return inputs.every((input, index) => (
        input.username === tail[index].username
        && input.lastInput === tail[index].content
    ));
}

function trimByTokenBudget(messages, openaiPreset) {
    const maxContext = safeNumber(openaiPreset?.openai_max_context, 4095);
    const maxTokens = safeNumber(openaiPreset?.openai_max_tokens, 300);
    const budget = Math.max(256, maxContext - maxTokens);

    const working = [...messages];
    const tokenCount = () => working.reduce((sum, item) => sum + estimateTokens(item.content), 0);

    while (tokenCount() > budget) {
        const idx = working.findIndex((item) => item.isHistory);
        if (idx === -1) break;
        working.splice(idx, 1);
    }

    // If still over budget, trim non-core system injections (ST-like graceful degradation).
    const removableSourcePrefixes = [
        'worldInfo',
        'world_info_depth_',
        'charDescription',
        'charPersonality',
        'scenario',
        'personaDescription',
        'dialogueExamples',
        'jailbreak',
        'nsfw',
    ];
    while (tokenCount() > budget) {
        const idx = working.findIndex((item) => {
            const source = String(item?.source || '');
            if (!source) return false;
            if (source === 'main' || source === 'sysprompt' || source === 'context_story') return false;
            return removableSourcePrefixes.some((prefix) => source.startsWith(prefix));
        });
        if (idx === -1) break;
        working.splice(idx, 1);
    }

    return {
        messages: working,
        tokenBudget: budget,
        tokenUsed: tokenCount(),
    };
}

function isPromptEnabled(orderItem, prompt) {
    if (!orderItem || orderItem.enabled !== true) {
        return false;
    }
    if (prompt && prompt.enabled === false) {
        return false;
    }
    return true;
}

function resolveCharacterDescription(characterCard) {
    const parsed = characterCard?.parsed || {};
    const directCandidates = [
        characterCard?.description,
        parsed?.description,
        parsed?.data?.description,
        parsed?.persona,
        parsed?.data?.persona,
        parsed?.creator_notes,
        parsed?.data?.creator_notes,
    ];
    const text = directCandidates
        .map((item) => safeString(item))
        .find(Boolean);
    if (text) {
        return text;
    }
    const cardName = safeString(characterCard?.name || parsed?.name || parsed?.data?.name, '');
    return cardName ? `角色名：${cardName}` : '';
}

function resolveCharacterPersonality(characterCard) {
    const parsed = characterCard?.parsed || {};
    const candidates = [
        characterCard?.metaFields?.personality,
        parsed?.personality,
        parsed?.data?.personality,
    ];
    return candidates.map((item) => safeString(item)).find(Boolean) || '';
}

function resolveCharacterScenario(characterCard) {
    const parsed = characterCard?.parsed || {};
    const candidates = [
        characterCard?.metaFields?.scenario,
        parsed?.scenario,
        parsed?.data?.scenario,
    ];
    return candidates.map((item) => safeString(item)).find(Boolean) || '';
}

function applyInstructFormatting(messages, instructPreset) {
    const instruct = {
        enabled: !!instructPreset?.enabled,
        wrap: instructPreset?.wrap !== false,
        input_sequence: safeString(instructPreset?.input_sequence),
        input_suffix: String(instructPreset?.input_suffix ?? ''),
        output_sequence: safeString(instructPreset?.output_sequence),
        output_suffix: String(instructPreset?.output_suffix ?? ''),
        system_sequence: safeString(instructPreset?.system_sequence),
        system_suffix: String(instructPreset?.system_suffix ?? ''),
        stop_sequence: String(instructPreset?.stop_sequence ?? ''),
        sequences_as_stop_strings: instructPreset?.sequences_as_stop_strings !== false,
        system_same_as_user: !!instructPreset?.system_same_as_user,
    };

    if (!instruct.enabled) {
        return { messages, stop: [], applied: false };
    }

    const separator = instruct.wrap ? '\n' : '';
    const formatted = messages.map((item) => {
        let prefix = '';
        let suffix = '';
        if (item.role === 'system') {
            prefix = instruct.system_same_as_user ? instruct.input_sequence : instruct.system_sequence;
            suffix = instruct.system_same_as_user ? instruct.input_suffix : instruct.system_suffix;
        } else if (item.role === 'assistant') {
            prefix = instruct.output_sequence;
            suffix = instruct.output_suffix;
        } else {
            prefix = instruct.input_sequence;
            suffix = instruct.input_suffix;
        }

        const content = [prefix, `${item.content}${suffix}`].filter(Boolean).join(separator);
        return { ...item, content };
    });

    const stopSet = new Set();
    if (instruct.stop_sequence) stopSet.add(instruct.stop_sequence);
    if (instruct.sequences_as_stop_strings) {
        [instruct.input_sequence, instruct.output_sequence, instruct.system_sequence]
            .filter(Boolean)
            .forEach((item) => stopSet.add(item));
    }

    return {
        messages: formatted,
        stop: [...stopSet].slice(0, 4),
        applied: true,
    };
}

async function readStreamedContent(response, onChunk) {
    const reader = response.body?.getReader?.();
    if (!reader) return '';

    const decoder = new TextDecoder();
    let buffer = '';
    let finalContent = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const raw = String(line || '').trim();
            if (!raw.startsWith('data:')) continue;
            const payload = raw.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
                const parsed = JSON.parse(payload);
                const delta = String(parsed?.choices?.[0]?.delta?.content || '');
                if (delta) {
                    finalContent += delta;
                    onChunk(delta);
                }
            } catch { /* ignore */ }
        }
    }

    return finalContent.trim();
}

async function sendByApiFormat({
    apiFormat,
    endpointBase,
    apiKey,
    requestBody,
    onStreamChunk,
}) {
    const format = String(apiFormat || 'openai').trim();
    const cleanBase = String(endpointBase || 'https://api.openai.com/v1').replace(/\/+$/, '');

    const normalizedBodyText = JSON.stringify(requestBody, null, 2);
    const printRequestBody = (tag, bodyText, fallbackLabel = 'Outbound') => {
        const stamp = new Date().toISOString();
        console.log(`[ST][${stamp}] [${tag}] Request Body:\n${bodyText}`);
    };

    if (format === 'anthropic') {
        const endpoint = `${cleanBase}/messages`;
        const systemParts = requestBody.messages
            .filter((item) => item.role === 'system')
            .map((item) => item.content)
            .filter(Boolean);
        const messages = requestBody.messages
            .filter((item) => item.role !== 'system')
            .map((item) => ({
                role: item.role === 'assistant' ? 'assistant' : 'user',
                content: item.content,
            }));

        const body = {
            model: requestBody.model,
            system: systemParts.join('\n\n'),
            messages,
            max_tokens: requestBody.max_tokens,
            temperature: requestBody.temperature,
            top_p: requestBody.top_p,
            stream: false,
        };
        const anthropicBodyText = JSON.stringify(body, null, 2);
        printRequestBody('Normalized', normalizedBodyText, 'Normalized');
        if (anthropicBodyText !== normalizedBodyText) {
            printRequestBody('Anthropic', anthropicBodyText);
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[API Error] Anthropic: ${response.status} ${errorText}`);
            throw new Error(`Anthropic API Error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const content = Array.isArray(data?.content)
            ? data.content.filter((item) => item?.type === 'text').map((item) => item.text).join('')
            : '';
        if (content) {
            onStreamChunk(content);
        }

        // console.log(`[API Response] Success. Content length: ${content.length}`);
        return { endpoint, responseBody: data, rawContent: String(content || '').trim() };
    }

    if (format === 'gemini') {
        const model = requestBody.model;
        const endpoint = `${cleanBase}/models/${model}:generateContent?key=${apiKey}`;

        // Convert OpenAI messages to Gemini contents
        const contents = requestBody.messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        const body = {
            contents,
            generationConfig: {
                maxOutputTokens: requestBody.max_tokens,
                temperature: requestBody.temperature,
                topP: requestBody.top_p,
            }
        };
        const geminiBodyText = JSON.stringify(body, null, 2);
        printRequestBody('Normalized', normalizedBodyText, 'Normalized');
        if (geminiBodyText !== normalizedBodyText) {
            printRequestBody('Gemini', geminiBodyText);
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[API Error] Gemini: ${response.status} ${errorText}`);
            throw new Error(`Gemini API Error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (content) {
            onStreamChunk(content);
        }
        // console.log(`[API Response] Success. Content length: ${content.length}`);
        return { endpoint, responseBody: data, rawContent: String(content || '').trim() };
    }

    // Default OpenAI format
    const endpoint = `${cleanBase}/chat/completions`;
    printRequestBody('OpenAI-Compatible', normalizedBodyText);
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[API Error] OpenAI: ${response.status} ${errorText}`);
        throw new Error(`OpenAI API Error: ${response.status} ${errorText}`);
    }

    if (requestBody.stream) {
        const rawContent = await readStreamedContent(response, onStreamChunk);
        console.log(`[API Response] Stream finished. Content length: ${rawContent.length}`);
        return { endpoint, responseBody: null, rawContent };
    }

    const data = await response.json();
    const content = safeString(data?.choices?.[0]?.message?.content);
    if (content) {
        onStreamChunk(content);
    }
    console.log(`[API Response] Success. Content length: ${content.length}`);
    return {
        endpoint,
        responseBody: data,
        rawContent: content,
    };
}

function applyRegexPostProcessing(content, preset) {
    const rules = Array.isArray(preset?.postProcessing?.regex) ? preset.postProcessing.regex : [];
    let output = String(content || '');
    let applied = 0;

    for (const rule of rules) {
        const pattern = safeString(rule?.pattern);
        if (!pattern) continue;
        const replacement = String(rule?.replacement ?? '');
        const flags = safeString(rule?.flags, 'g');
        try {
            const regex = new RegExp(pattern, flags);
            output = output.replace(regex, replacement);
            applied += 1;
        } catch { /* ignore */ }
    }

    return { content: output.trim(), applied };
}

function stageLog(stage, payload = {}) {
    const stamp = new Date().toISOString();
    console.log(`[ST][${stamp}][${stage}]`, payload);
}

export function getDefaultSillyTavernPresetTemplate() {
    return {
        name: 'SillyTavern-Default',
        openai: {
            chat_completion_source: 'openai',
            openai_model: 'gpt-4o-mini',
            temperature: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
            top_p: 1,
            top_k: 0,
            min_p: 0,
            repetition_penalty: 1,
            openai_max_context: 4095,
            openai_max_tokens: 300,
            stream_openai: false,
            world_info_recursive: true,
            world_info_recursion_limit: 4,
            world_info_budget: 25,
            world_info_scan_depth: 0,
            wi_format: '{0}',
            scenario_format: '{{scenario}}',
            personality_format: '{{personality}}',
            use_sysprompt: true,
            prompts: [
                { name: 'Main Prompt', system_prompt: true, role: 'system', content: "Write {{char}}'s next reply in a fictional chat between {{charIfNotGroup}} and {{user}}.", identifier: 'main' },
                { name: 'Auxiliary Prompt', system_prompt: true, role: 'system', content: '', identifier: 'nsfw' },
                { identifier: 'dialogueExamples', name: 'Chat Examples', system_prompt: true, marker: true },
                { name: 'Post-History Instructions', system_prompt: true, role: 'system', content: '', identifier: 'jailbreak' },
                { identifier: 'chatHistory', name: 'Chat History', system_prompt: true, marker: true },
                { identifier: 'worldInfoAfter', name: 'World Info (after)', system_prompt: true, marker: true },
                { identifier: 'worldInfoBefore', name: 'World Info (before)', system_prompt: true, marker: true },
                { identifier: 'charDescription', name: 'Char Description', system_prompt: true, marker: true },
                { identifier: 'charPersonality', name: 'Char Personality', system_prompt: true, marker: true },
                { identifier: 'scenario', name: 'Scenario', system_prompt: true, marker: true },
                { identifier: 'personaDescription', name: 'Persona Description', system_prompt: true, marker: true },
            ],
            prompt_order: [
                {
                    character_id: 100000,
                    order: [
                        { identifier: 'main', enabled: true },
                        { identifier: 'worldInfoBefore', enabled: true },
                        { identifier: 'charDescription', enabled: true },
                        { identifier: 'charPersonality', enabled: true },
                        { identifier: 'scenario', enabled: true },
                        { identifier: 'nsfw', enabled: true },
                        { identifier: 'worldInfoAfter', enabled: true },
                        { identifier: 'chatHistory', enabled: true },
                        { identifier: 'jailbreak', enabled: true },
                    ],
                },
            ],
        },
        context: {
            name: 'Default',
            story_string: '{{#if system}}{{system}}\n{{/if}}{{#if wiBefore}}{{wiBefore}}\n{{/if}}{{#if description}}{{description}}\n{{/if}}{{#if personality}}{{personality}}\n{{/if}}{{#if scenario}}{{scenario}}\n{{/if}}{{#if wiAfter}}{{wiAfter}}{{/if}}{{trim}}',
            story_string_position: 0,
            use_stop_strings: false,
            names_as_stop_strings: true,
        },
        instruct: {
            name: 'ChatML',
            enabled: false,
            input_sequence: '<|im_start|>user',
            output_sequence: '<|im_start|>assistant',
            system_sequence: '<|im_start|>system',
            stop_sequence: '<|im_end|>',
            wrap: true,
            input_suffix: '<|im_end|>\n',
            output_suffix: '<|im_end|>\n',
            system_suffix: '<|im_end|>\n',
            sequences_as_stop_strings: true,
        },
        sysprompt: {
            name: 'Roleplay - Detailed',
            enabled: true,
            content: 'Develop the plot slowly, always stay in character. Describe all actions in full, elaborate, explicit, graphic, and vivid detail. Mention all relevant sensory perceptions. Keep the story immersive and engaging.',
            post_history: '',
        },
        postProcessing: {
            regex: [],
        },
    };
}

function normalizePreset(rawPreset) {
    const template = getDefaultSillyTavernPresetTemplate();
    const raw = (rawPreset && typeof rawPreset === 'object') ? rawPreset : {};
    const hasNestedOpenai = !!(raw.openai && typeof raw.openai === 'object');
    // ST compatibility: many presets store openai fields at top-level instead of raw.openai.
    const rawOpenai = hasNestedOpenai ? raw.openai : raw;
    const resolvedOpenaiModel = safeString(
        rawOpenai.openai_model || rawOpenai.model || raw.openai_model || raw.model,
    );

    const normalized = {
        ...template,
        ...raw,
        openai: { ...template.openai, ...rawOpenai },
        context: { ...template.context, ...(raw.context || {}) },
        instruct: { ...template.instruct, ...(raw.instruct || {}) },
        sysprompt: { ...template.sysprompt, ...(raw.sysprompt || {}) },
        postProcessing: { ...template.postProcessing, ...(raw.postProcessing || {}) },
    };
    if (resolvedOpenaiModel) {
        normalized.openai.openai_model = resolvedOpenaiModel;
    }
    return normalized;
}

function defaultModelByFormat(apiFormat) {
    const format = safeString(apiFormat, 'openai').toLowerCase();
    if (format === 'anthropic') {
        return 'claude-3-5-sonnet-latest';
    }
    if (format === 'gemini') {
        return 'gemini-1.5-pro';
    }
    return 'gpt-4o-mini';
}

function buildModelCandidates({ apiFormat, profileModel, presetModel }) {
    const profile = safeString(profileModel);
    if (profile) {
        // Respect explicit API profile selection strictly to avoid probing unexpected models.
        return [profile];
    }

    const preset = safeString(presetModel);
    if (preset) {
        return [preset];
    }

    return [defaultModelByFormat(apiFormat)];
}

function isModelErrorMessage(error) {
    const text = String(error?.message || '').toLowerCase();
    if (!text) return false;
    return (
        text.includes('model')
        && (text.includes('invalid') || text.includes('not found') || text.includes('unsupported') || text.includes('does not exist'))
    );
}

export async function runSillyTavernChatCompletion({
    settings,
    presetRaw,
    characterCard,
    worldBook,
    narratorName,
    history,
    roundNo,
    roundPlayerInputs,
    roundSystemPrompts = [],
    endpointBase,
    apiKey,
    onToken,
    forceStream = false,
    combinedPersona = '',
}) {
    const preset = normalizePreset(presetRaw);
    const hasExplicitPromptOrder = Array.isArray(presetRaw?.prompt_order)
        || Array.isArray(presetRaw?.openai?.prompt_order);
    const openaiPreset = preset.openai;
    const promptMap = toPromptMap(openaiPreset);
    const promptOrder = toPromptOrder(openaiPreset);

    const roundInputText = roundPlayerInputs.map((item) => `${item.username}: ${item.lastInput}`).join('\n');
    const wiFormat = safeString(openaiPreset.wi_format, '{0}');
    const worldInfo = evaluateWorldInfo(worldBook, {
        history,
        roundInputText,
        wiFormat,
        openaiPreset,
    });

    const characterDescription = resolveCharacterDescription(characterCard);
    const characterPersonality = resolveCharacterPersonality(characterCard);
    const characterScenario = resolveCharacterScenario(characterCard);
    const personaDescription = combinedPersona || safeString(settings?.personaDescription);

    const fullVars = {
        char: narratorName,
        char_name: narratorName,
        character: narratorName,
        charIfNotGroup: narratorName,
        user: '玩家',
        user_name: '玩家',
        group: '玩家们',
        persona: personaDescription,
        personaDescription: personaDescription,
        description: characterDescription,
        charDescription: characterDescription,
        personality: renderVars(openaiPreset.personality_format, { personality: characterPersonality }),
        charPersonality: renderVars(openaiPreset.personality_format, { personality: characterPersonality }),
        scenario: renderVars(openaiPreset.scenario_format, { scenario: characterScenario }),
        charScenario: renderVars(openaiPreset.scenario_format, { scenario: characterScenario }),
        mesExamples: safeString(characterCard?.metaFields?.messageExample),
        dialogueExamples: safeString(characterCard?.metaFields?.messageExample),
        jailbreak: safeString(characterCard?.metaFields?.postHistoryInstructions),
        postHistoryInstructions: safeString(characterCard?.metaFields?.postHistoryInstructions),
        cardSystemPrompt: safeString(characterCard?.metaFields?.systemPrompt),
        wiBefore: worldInfo.before,
        wiAfter: worldInfo.after,
        wiTop: worldInfo.top,
        wiBottom: worldInfo.bottom,
        system: safeString(preset.sysprompt.enabled ? preset.sysprompt.content : ''),
    };

    const storyBlock = renderContextStoryString(preset.context.story_string, fullVars);
    fullVars.storyString = storyBlock;
    fullVars.context = storyBlock;
    fullVars.story_string = storyBlock;

    const historyMessages = toHistoryMessages(history);
    const hasRoundInputsInHistory = historyContainsRoundInputs(history, roundPlayerInputs);
    const currentRoundMessage = {
        role: 'user',
        content: roundInputText ? `第 ${roundNo} 轮玩家行动：\n${roundInputText}` : '',
        isHistory: true,
    };

    const finalMessages = [];
    const pushSystemIfAny = (content, source, role = 'system') => {
        const text = safeString(content);
        if (!text) return;
        finalMessages.push({ role, content: text, source });
    };
    (Array.isArray(roundSystemPrompts) ? roundSystemPrompts : []).forEach((item, index) => {
        pushSystemIfAny(item, `round_system_${index}`);
    });

    const processedIds = new Set();
    for (const orderItem of promptOrder) {
        const identifier = String(orderItem.identifier || '');
        const prompt = promptMap.get(identifier);
        if (!isPromptEnabled(orderItem, prompt)) continue;
        processedIds.add(identifier);

        const renderPrompt = (content) => renderContextStoryString(content, fullVars);

        switch (identifier) {
            case 'main': {
                let finalSys = '';
                if (openaiPreset.use_sysprompt && preset.sysprompt.enabled) {
                    finalSys = renderPrompt(preset.sysprompt.content || '');
                }
                if (fullVars.cardSystemPrompt) {
                    if (finalSys.includes('{{original}}')) {
                        finalSys = finalSys.replace(/\{\{original\}\}/g, fullVars.cardSystemPrompt);
                    } else if (finalSys) {
                        finalSys = `${finalSys}\n${fullVars.cardSystemPrompt}`;
                    } else {
                        finalSys = fullVars.cardSystemPrompt;
                    }
                }
                if (finalSys) pushSystemIfAny(finalSys, 'sysprompt');

                const mainContent = prompt?.content ? renderPrompt(prompt.content) : '';
                pushSystemIfAny(mainContent, identifier);
                break;
            }
            case 'worldInfoBefore':
                pushSystemIfAny(fullVars.wiBefore, identifier);
                break;
            case 'worldInfoAfter':
                pushSystemIfAny(fullVars.wiAfter, identifier);
                break;
            case 'charDescription':
                pushSystemIfAny(fullVars.description, identifier);
                break;
            case 'charPersonality':
                pushSystemIfAny(fullVars.personality, identifier);
                break;
            case 'scenario':
                pushSystemIfAny(fullVars.scenario, identifier);
                break;
            case 'personaDescription':
                pushSystemIfAny(fullVars.persona, identifier);
                break;
            case 'dialogueExamples':
                pushSystemIfAny(renderPrompt(fullVars.mesExamples), identifier);
                break;
            case 'chatHistory': {
                pushSystemIfAny(fullVars.wiTop, 'worldInfoTop');
                const chatMsgs = [...historyMessages];
                if (!hasRoundInputsInHistory && safeString(currentRoundMessage.content)) {
                    chatMsgs.push(currentRoundMessage);
                }

                chatMsgs.forEach((msg) => finalMessages.push(msg));
                pushSystemIfAny(fullVars.wiBottom, 'worldInfoBottom');
                break;
            }
            case 'jailbreak': {
                let finalJb = prompt?.content ? renderPrompt(prompt.content) : '';
                if (fullVars.postHistoryInstructions) {
                    if (finalJb.includes('{{original}}')) {
                        finalJb = finalJb.replace(/\{\{original\}\}/g, fullVars.postHistoryInstructions);
                    } else if (finalJb) {
                        finalJb = `${finalJb}\n${fullVars.postHistoryInstructions}`;
                    } else {
                        finalJb = fullVars.postHistoryInstructions;
                    }
                }
                pushSystemIfAny(finalJb, identifier);
                break;
            }
            default: {
                const role = safeString(prompt?.role, 'system');
                const content = prompt?.content ? renderPrompt(prompt.content) : '';
                pushSystemIfAny(content, identifier, role);
                break;
            }
        }
    }

    // Include any custom prompts from promptMap not in the order
    for (const [identifier, prompt] of promptMap) {
        if (processedIds.has(identifier)) continue;
        if (!prompt || prompt.enabled === false) continue;
        const content = String(prompt.content || '').trim();
        if (!content) continue;
        const role = safeString(prompt?.role, 'system');
        const rendered = renderContextStoryString(content, fullVars);
        pushSystemIfAny(rendered, identifier, role);
        processedIds.add(identifier);
    }

    if (worldInfo.depthEntries && worldInfo.depthEntries.length > 0) {
        const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' };
        // Group by depth
        const depthGroups = new Map();
        worldInfo.depthEntries.forEach(entry => {
            const d = Math.max(0, safeNumber(entry.depth, 0));
            if (!depthGroups.has(d)) depthGroups.set(d, []);
            depthGroups.get(d).push(entry);
        });
        
        // Sort depths descending
        const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => b - a);
        for (const d of sortedDepths) {
            const entriesAtDepth = depthGroups.get(d);
            const index = Math.max(0, finalMessages.length - d);
            
            // Insert all entries at this depth
            const toInsert = entriesAtDepth.map(entry => ({
                role: roleMap[safeNumber(entry.role, 0)] || 'system',
                content: entry.text,
                source: `world_info_depth_${entry.uid}`,
            }));
            finalMessages.splice(index, 0, ...toInsert);
        }
    }

    const budgeted = trimByTokenBudget(finalMessages, openaiPreset);
    const formatted = applyInstructFormatting(budgeted.messages, preset.instruct);

    const requestMessages = formatted.messages
        .filter((item) => item && String(item.content || '').trim())
        .map((item) => ({
            role: String(item.role || 'system'),
            content: String(item.content || ''),
        }));

    const apiFormat = safeString(settings.apiFormat, 'openai');
    const modelCandidates = buildModelCandidates({
        apiFormat,
        profileModel: settings.model,
        presetModel: openaiPreset.openai_model,
    });
    const requestBodyBase = {
        messages: requestMessages,
        temperature: safeNumber(openaiPreset.temperature, safeNumber(settings.temperature, 0.7)),
        top_p: safeNumber(openaiPreset.top_p, 1),
        max_tokens: safeNumber(openaiPreset.openai_max_tokens, safeNumber(settings.maxTokens, 1024)),
        presence_penalty: safeNumber(openaiPreset.presence_penalty, 0),
        frequency_penalty: safeNumber(openaiPreset.frequency_penalty, 0),
        stream: !!forceStream || !!openaiPreset.stream_openai,
    };

    if (openaiPreset.top_k > 0) requestBodyBase.top_k = safeNumber(openaiPreset.top_k, 0);
    if (openaiPreset.top_a > 0) requestBodyBase.top_a = safeNumber(openaiPreset.top_a, 0);
    if (openaiPreset.min_p > 0) requestBodyBase.min_p = safeNumber(openaiPreset.min_p, 0);
    if (openaiPreset.repetition_penalty !== 1) requestBodyBase.repetition_penalty = safeNumber(openaiPreset.repetition_penalty, 1);

    if (formatted.stop.length) requestBodyBase.stop = formatted.stop;

    let transport = null;
    let requestBody = null;
    let lastError = null;
    const emitToken = typeof onToken === 'function'
        ? (chunk) => {
            const text = String(chunk || '');
            if (!text) return;
            onToken(text);
        }
        : () => { };
    for (const model of modelCandidates) {
        requestBody = { ...requestBodyBase, model };
        try {
            transport = await sendByApiFormat({
                apiFormat,
                endpointBase,
                apiKey,
                requestBody,
                onStreamChunk: emitToken,
            });
            lastError = null;
            break;
        } catch (error) {
            lastError = error;
            if (!isModelErrorMessage(error)) {
                throw error;
            }
        }
    }
    if (!transport) {
        throw lastError || new Error(t('api.model_call_failed'));
    }

    const postProcessed = applyRegexPostProcessing(transport.rawContent, preset);

    return {
        content: postProcessed.content,
        requestBody,
        requestMeta: {
            endpoint: transport.endpoint,
            apiFormat,
        },
        diagnostics: {
            modelCandidates,
            selectedModel: requestBody?.model || '',
            triggeredWorldInfoCount: worldInfo.triggeredCount,
            triggeredWorldInfoIds: worldInfo.triggeredIds || [],
            worldInfoTokenBudget: worldInfo.tokenBudget || 0,
            worldInfoTokenUsed: worldInfo.tokenUsed || 0,
            tokenUsed: budgeted.tokenUsed,
            requestMessages,
        },
    };
}
