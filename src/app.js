import express from 'express';
import path from 'node:path';
import session from 'express-session';
import { buildRouter } from './routes.js';
import { attachCurrentUser } from './middleware/auth.js';
import { initI18n, getI18nMiddleware, getClientStrings } from './i18n.js';
import i18next from 'i18next';

export async function createApp(config) {
    await initI18n(config);

    const app = express();

    const sessionMiddleware = session({
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
        },
    });

    app.locals.config = config;
    app.locals.sessionMiddleware = sessionMiddleware;

    app.set('view engine', 'ejs');
    app.set('views', path.resolve(config.baseDir, 'views'));

    app.use(express.urlencoded({ extended: false, limit: '20mb' }));
    app.use(express.json({ limit: '20mb' }));

    app.use(sessionMiddleware);

    app.use(getI18nMiddleware());

    app.use(attachCurrentUser(config));

    app.use((req, res, next) => {
        if (req.language) i18next.changeLanguage(req.language);
        res.locals.t = req.t || ((key, opts) => key);
        res.locals.locale = req.language || 'zh-CN';
        const clientI18n = getClientStrings(req);
        res.locals.__i18n = JSON.stringify(clientI18n);
        next();
    });

    app.use('/css', express.static(path.resolve(config.baseDir, 'public/css')));
    app.use('/js', express.static(path.resolve(config.baseDir, 'public/js')));

    app.use(buildRouter());

    return app;
}
