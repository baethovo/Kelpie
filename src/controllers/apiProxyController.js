import { readUserSettings, updateUserSettings } from '../services/settingsService.js';
import { t } from '../i18n.js';

export async function getModels(req, res) {
    const { baseUrl, apiKey, format } = req.body;
    if (!baseUrl || !apiKey) {
        return res.status(400).json({ ok: false, error: t('api.missing_params') });
    }

    try {
        let url = baseUrl.replace(/\/+$/, '');
        
        // Gemini specific handling
        if (format === 'gemini') {
            // Ensure version is present
            if (!url.includes('/v1') && !url.includes('/v1beta')) {
                url += '/v1beta';
            }
            const fetchUrl = `${url}/models?key=${apiKey}`;
            const response = await fetch(fetchUrl);
            if (!response.ok) {
                const errText = await response.text();
                let errorMsg = `Gemini API 错误: ${response.status}`;
                try {
                    const errJson = JSON.parse(errText);
                    errorMsg += ` ${errJson.error?.message || ''}`;
                } catch {
                    errorMsg += ` ${errText.slice(0, 100)}`;
                }
                return res.status(response.status).json({ ok: false, error: errorMsg });
            }
            const data = await response.json();
            const models = (data.models || []).map(m => m.name.replace('models/', ''));
            return res.json({ ok: true, models });
        }

        // OpenAI / Anthropic / Others
        const response = await fetch(url + '/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            return res.status(response.status).json({ ok: false, error: `API 错误: ${response.status} ${errText.slice(0, 100)}` });
        }

        const data = await response.json();
        let models = [];
        if (Array.isArray(data.data)) {
            models = data.data.map(m => m.id);
        } else if (Array.isArray(data)) {
            models = data.map(m => m.id || m.name);
        }

        res.json({ ok: true, models });
    } catch (error) {
        console.error('getModels error:', error);
        return res.status(500).json({ ok: false, error: t('api.fetch_models_failed') });
    }
}

export async function testApi(req, res) {
    const { baseUrl, apiKey, format, model } = req.body;
    if (!baseUrl || !apiKey || !model) {
        return res.status(400).json({ ok: false, error: t('api.fill_all_fields') });
    }

    try {
        let url = baseUrl.replace(/\/+$/, '');
        let response;

        if (format === 'gemini') {
            if (!url.includes('/v1') && !url.includes('/v1beta')) {
                url += '/v1beta';
            }
            const testUrl = `${url}/models/${model}:generateContent?key=${apiKey}`;
            response = await fetch(testUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Say hello' }] }],
                    generationConfig: { maxOutputTokens: 10 }
                })
            });
        } else {
            const testUrl = `${url}/chat/completions`;
            response = await fetch(testUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: 'Say hello' }],
                    max_tokens: 10
                })
            });
        }

        if (!response.ok) {
            const errText = await response.text();
            return res.status(response.status).json({ ok: false, error: `API 错误: ${response.status} ${errText.slice(0, 100)}` });
        }

        const data = await response.json();
        let content = '';
        if (format === 'gemini') {
            content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        } else {
            content = data.choices?.[0]?.message?.content;
        }
        
        res.json({ ok: true, message: `测试成功: ${content || 'API 响应成功但解析失败'}` });
    } catch (error) {
        console.error('testApi error:', error);
        return res.status(500).json({ ok: false, error: t('api.test_failed') });
    }
}

export async function postTestProfile(req, res) {
    const { profileId } = req.body;
    if (!profileId) return res.status(400).json({ ok: false, error: t('api.missing_profile_id') });

    const baseDir = req.app.locals.config.baseDir;
    const settings = readUserSettings(baseDir, req.currentUser.userid);
    const profile = (settings.apiProfiles || []).find(p => p.id === profileId);

    if (!profile) return res.status(404).json({ ok: false, error: t('api.config_not_found') });

    const { baseUrl, apiKey, format, model } = profile;
    if (!baseUrl || !apiKey || !model) {
        return res.status(400).json({ ok: false, error: t('api.config_incomplete') });
    }

    const startTime = Date.now();
    let isSuccess = false;
    let errorMsg = '';
    
    try {
        let url = baseUrl.replace(/\/+$/, '');
        let response;
        if (format === 'gemini') {
            if (!url.includes('/v1') && !url.includes('/v1beta')) url += '/v1beta';
            response = await fetch(`${url}/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping' }] }], generationConfig: { maxOutputTokens: 5 } })
            });
        } else {
            response = await fetch(`${url}/chat/completions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Ping' }], max_tokens: 5 })
            });
        }

        if (!response.ok) {
            const errText = await response.text();
            errorMsg = `错误 ${response.status}: ${errText.slice(0, 100)}`;
        } else {
            isSuccess = true;
        }
    } catch (e) {
        errorMsg = t('api.connect_failed');
    }

    const latency = Date.now() - startTime;
    const testAt = new Date().toISOString();

    updateUserSettings(baseDir, req.currentUser.userid, {
        action: 'update_test_status',
        profileId,
        lastTestAt: testAt,
        lastTestStatus: isSuccess ? 'success' : 'error',
        lastTestLatencyMs: latency,
        lastTestModel: model
    });

    if (isSuccess) {
        res.json({ ok: true, message: t('api.test_success'), latency, lastTestAt: testAt });
    } else {
        res.status(400).json({ ok: false, error: errorMsg, latency, lastTestAt: testAt });
    }
}
