(function () {
    'use strict';

    window.__i18nL10n = window.__i18nL10n || { locale: 'zh-CN', strings: {} };

    window.__ = function (key, options) {
        if (!key) return '';
        const parts = key.split('.');
        let val = window.__i18nL10n.strings;
        for (const part of parts) {
            if (!val || typeof val !== 'object') return key;
            val = val[part];
        }
        if (typeof val !== 'string') return key;

        if (options) {
            Object.keys(options).forEach(function (k) {
                val = val.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), options[k]);
            });
        }
        return val;
    };

    window.__locale = function () {
        return window.__i18nL10n.locale || 'zh-CN';
    };
})();
