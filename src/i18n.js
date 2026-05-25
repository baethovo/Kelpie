import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import middleware from 'i18next-http-middleware';
import fs from 'node:fs';
import path from 'node:path';

let initialized = false;

export async function initI18n(config) {
    if (initialized) return i18next;

    const baseDir = config.baseDir;
    const localesPath = path.join(baseDir, 'locales');
    let preloadLanguages = ['zh-CN', 'en'];

    try {
        if (fs.existsSync(localesPath)) {
            const files = fs.readdirSync(localesPath);
            const discovered = files.filter(file => {
                const fullPath = path.join(localesPath, file);
                return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'translation.json'));
            });
            if (discovered.length > 0) {
                preloadLanguages = discovered;
            }
        }
    } catch (e) {
        console.error('Failed to read locales directory:', e);
    }

    await i18next
        .use(Backend)
        .use(middleware.LanguageDetector)
        .init({
            fallbackLng: 'zh-CN',
            preload: preloadLanguages,
            ns: ['translation'],
            defaultNS: 'translation',
            backend: {
                loadPath: `${baseDir}/locales/{{lng}}/{{ns}}.json`,
            },
            detection: {
                order: ['cookie', 'header', 'query'],
                lookupCookie: 'kelpie_locale',
                lookupQuery: 'lang',
                caches: ['cookie'],
            },
            interpolation: {
                escapeValue: false,
            },
        });

    initialized = true;
    return i18next;
}

export function getI18nMiddleware() {
    return middleware.handle(i18next);
}

export function t(key, options) {
    return i18next.t(key, options);
}

export function getClientStrings(req) {
    const i18nInstance = req?.i18n || i18next;
    const locale = i18nInstance.language || 'zh-CN';
    const ns = 'translation';
    const resourceBundle = i18nInstance.getResourceBundle(locale, ns) || {};

    return {
        locale,
        strings: resourceBundle,
    };
}
