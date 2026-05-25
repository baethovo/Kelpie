import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';

const DEFAULT_CONFIG = {
    port: 3000,
    adminDefaultPassword: 'admin123456',
};

export function loadConfig(baseDir) {
    const configPath = path.resolve(baseDir, 'config/default.yaml');
    
    // Generate a high-entropy ephemeral secret for the current process lifecycle
    const ephemeralSecret = crypto.randomBytes(32).toString('hex');

    if (!fs.existsSync(configPath)) {
        return {
            ...DEFAULT_CONFIG,
            sessionSecret: ephemeralSecret,
            baseDir,
        };
    }

    const fileContent = fs.readFileSync(configPath, 'utf8');
    const parsed = yaml.load(fileContent) || {};

    return {
        ...DEFAULT_CONFIG,
        ...parsed,
        sessionSecret: ephemeralSecret, // Always use the ephemeral secret, ignore any file-based one
        baseDir,
    };
}