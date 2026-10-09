const { toRupees } = require("./money");

/**
 * Reduce a group's expense stream into a net position per member.
 *
 *   net = (what they paid out) - (what they consumed)
 *
 * Positive net means the group owes them; negative means they owe the group.
 * Settlements carry the same shape as expenses (payer -> single split), so a
 * repayment naturally pulls both sides toward zero without special-casing.
 *
 * All figures are integer paise internally; rupees are added for the client.
 */
const computeBalances = (members, expenses) => {
    const paid = new Map();
    const owed = new Map();
    for (const m of members) {
        paid.set(String(m._id), 0);
        owed.set(String(m._id), 0);
    }

    const bump = (map, id, delta) => {
        const key = String(id);
        // A member deleted out from under an expense would land here. We refuse
        // that deletion in the controller, so treat it as a bug worth surfacing
        // rather than silently dropping money out of the ledger.
        if (!map.has(key)) map.set(key, 0);
        map.set(key, map.get(key) + delta);
    };

    for (const e of expenses) {
        bump(paid, e.paidBy, e.amount);
        for (const s of e.splits) bump(owed, s.member, s.share);
    }

    const rows = members.map((m) => {
        const id = String(m._id);
        const p = paid.get(id) || 0;
        const o = owed.get(id) || 0;
        return {
            memberId: id,
            name: m.name,
            // Removed members stay in the reduction — their old expenses are
            // still in the stream, so dropping them here would open a hole in
            // the drift check. Presentation decides whether to show the row.
            removed: Boolean(m.removedAt),
            paid: toRupees(p),
            owed: toRupees(o),
            net: toRupees(p - o),
            netPaise: p - o,
        };
    });

    // The ledger must be a closed system. If this ever trips, an expense
    // references a member outside the group, or a split slipped past validation.
    const drift = rows.reduce((sum, r) => sum + r.netPaise, 0);

    return { rows, drift };
};

/**
 * Turn net positions into the fewest payments that clear them.
 *
 * Greedy: match the largest creditor against the largest debtor, settle the
 * smaller of the two, repeat. Not provably optimal in every case (that problem
 * is NP-hard) but it collapses a tangle of obligations into near-minimal
 * transfers, which is the behaviour people actually want.
 */
const simplifyDebts = (rows) => {
    const creditors = rows
        .filter((r) => r.netPaise > 0)
        .map((r) => ({ ...r, remaining: r.netPaise }))
        .sort((a, b) => b.remaining - a.remaining);

    const debtors = rows
        .filter((r) => r.netPaise < 0)
        .map((r) => ({ ...r, remaining: -r.netPaise }))
        .sort((a, b) => b.remaining - a.remaining);

    const transfers = [];
    let ci = 0;
    let di = 0;

    while (ci < creditors.length && di < debtors.length) {
        const c = creditors[ci];
        const d = debtors[di];
        const amount = Math.min(c.remaining, d.remaining);

        if (amount > 0) {
            transfers.push({
                fromMemberId: d.memberId,
                fromName: d.name,
                toMemberId: c.memberId,
                toName: c.name,
                amount: toRupees(amount),
                amountPaise: amount,
            });
        }

        c.remaining -= amount;
        d.remaining -= amount;
        if (c.remaining === 0) ci += 1;
        if (d.remaining === 0) di += 1;
    }

    return transfers;
};

module.exports = { computeBalances, simplifyDebts };
