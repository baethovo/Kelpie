import { getUserById } from '../services/userService.js';

export function attachCurrentUser(config) {
    return function attachCurrentUserHandler(req, _res, next) {
        const userId = req.session?.userId;
        if (userId) {
            req.currentUser = getUserById(config.baseDir, userId) || null;
        } else {
            req.currentUser = null;
        }

        next();
    };
}

export function requireAuth(req, res, next) {
    if (!req.currentUser) {
        return res.redirect('/login');
    }

    return next();
}

export function requireGuest(req, res, next) {
    if (req.currentUser) {
        return res.redirect('/');
    }

    return next();
}