const { AppError } = require("./../utils/appError");

/**
 * Minimal fixed-window limiter, no dependency.
 *
 * In-memory, so it resets on restart and doesn't coordinate across instances —
 * for a single-process app it's enough to stop someone grinding passwords, and
 * it's honest about what it is. Move to Redis (or express-rate-limit with a
 * shared store) before running more than one process.
 */
const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 10, message } = {}) => {
    const hits = new Map();

    // Drop expired buckets so the map can't grow without bound.
    const sweep = (now) => {
        for (const [key, entry] of hits) {
            if (entry.resetAt <= now) hits.delete(key);
        }
    };

    return (req, res, next) => {
        const now = Date.now();
        if (hits.size > 5000) sweep(now);

        const key = req.ip || req.connection?.remoteAddress || "unknown";
        const entry = hits.get(key);

        if (!entry || entry.resetAt <= now) {
            hits.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        entry.count += 1;
        if (entry.count > max) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            res.set("Retry-After", String(retryAfter));
            return next(
                new AppError(
                    message || `Too many attempts. Try again in ${retryAfter}s.`,
                    429
                )
            );
        }
        next();
    };
};

module.exports = { rateLimit };
