const Member = require("../models/membersModel");
const Expense = require("../models/expenseModel");
const { computeBalances, simplifyDebts } = require("./balances");

/**
 * Load and reduce the ledgers for many groups at once.
 *
 * Two queries total, no matter how many groups — a per-group call would be an
 * N+1, and the "what do I owe overall" view fans out across every group a
 * person belongs to.
 *
 * Returns Map<groupId, { members, expenses, rows, drift, transfers, totalSpend }>
 */
const loadLedgers = async (groupIds) => {
    const ids = groupIds.map(String);
    if (ids.length === 0) return new Map();

    const [members, expenses] = await Promise.all([
        Member.find({ groupId: { $in: groupIds } }).sort({ createdAt: 1 }),
        Expense.find({ groupId: { $in: groupIds } }),
    ]);

    const buckets = new Map(ids.map((id) => [id, { members: [], expenses: [] }]));
    for (const m of members) buckets.get(String(m.groupId))?.members.push(m);
    for (const e of expenses) buckets.get(String(e.groupId))?.expenses.push(e);

    const out = new Map();
    for (const [id, bucket] of buckets) {
        const { rows, drift } = computeBalances(bucket.members, bucket.expenses);
        out.set(id, {
            members: bucket.members,
            expenses: bucket.expenses,
            rows,
            drift,
            transfers: simplifyDebts(rows),
            totalSpend: bucket.expenses
                .filter((e) => e.type === "expense")
                .reduce((sum, e) => sum + e.amount, 0),
        });
    }
    return out;
};

/**
 * Every group a user can see: ones they created, plus ones they were added to
 * as a member. Before this existed, only the creator could see a group — which
 * meant the people who owed money couldn't reach the group they owed it in.
 */
const visibleGroupIds = async (Group, userId) => {
    const [owned, memberships] = await Promise.all([
        Group.find({ userId }).select("_id"),
        Member.find({ userId, removedAt: null }).select("groupId"),
    ]);

    const ids = new Map();
    for (const g of owned) ids.set(String(g._id), g._id);
    for (const m of memberships) ids.set(String(m.groupId), m.groupId);
    return [...ids.values()];
};

module.exports = { loadLedgers, visibleGroupIds };
