// All money is stored as an INTEGER number of paise.
// The API speaks rupees (decimal); conversion happens at the controller edge.
// Never let a float into the database — 0.1 + 0.2 !== 0.3 drifts a ledger fast.

const { AppError } = require("./appError");

const toPaise = (rupees, label = "amount") => {
    const n = Number(rupees);
    if (!Number.isFinite(n)) throw new AppError(`${label} must be a number`, 400);
    if (n < 0) throw new AppError(`${label} cannot be negative`, 400);

    // Scale to paise, absorbing binary-float noise (0.07 * 100 = 7.000000000000001)
    // without hiding a genuinely over-precise input.
    const scaled = Number((n * 100).toFixed(6));

    // Reject rather than round: silently turning 1.234 into 1.23 loses a third
    // of a paisa of somebody's money and nobody is told.
    if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
        throw new AppError(`${label} supports at most 2 decimal places`, 400);
    }

    const paise = Math.round(scaled);
    if (!Number.isSafeInteger(paise)) throw new AppError(`${label} is too large`, 400);
    return paise;
};

const toRupees = (paise) => Number((paise / 100).toFixed(2));

/**
 * Split an amount equally, in paise, with no rounding loss.
 *
 * 10000 paise across 3 members is 3333 / 3333 / 3334 — the leftover paise has
 * to land on somebody or the splits stop summing to the total and every
 * downstream balance goes wrong. The payer absorbs the remainder first (they
 * fronted the money), then the rest in a stable id order, so the result is
 * deterministic rather than dependent on array order.
 */
const splitEqually = (amountPaise, memberIds, payerId) => {
    const ids = [...new Set(memberIds.map(String))];
    if (ids.length === 0) throw new AppError("An expense needs at least one participant", 400);

    const base = Math.floor(amountPaise / ids.length);
    let remainder = amountPaise - base * ids.length;

    const payerFirst = [
        ...ids.filter((id) => id === String(payerId)),
        ...ids.filter((id) => id !== String(payerId)).sort(),
    ];

    const byId = new Map(payerFirst.map((id) => [id, base]));
    for (const id of payerFirst) {
        if (remainder <= 0) break;
        byId.set(id, byId.get(id) + 1);
        remainder -= 1;
    }

    // Preserve the caller's ordering in the output.
    return ids.map((id) => ({ member: id, share: byId.get(id) }));
};

module.exports = { toPaise, toRupees, splitEqually };
