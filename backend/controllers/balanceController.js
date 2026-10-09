const Group = require("../models/groupModel");
const Member = require("../models/membersModel");
const User = require("../models/userModel");
const { AppError, catchAsync } = require("../utils/appError");
const { toRupees } = require("../utils/money");
const { loadLedgers, visibleGroupIds } = require("../utils/ledger");

/**
 * Removed members are reduced over — their old expenses are still in the
 * stream — but they only earn a row on screen if something is still open
 * against them. Removal requires a zero net, so in practice this drops them
 * silently; it keeps them visible if a legacy record ever slipped through
 * with money attached, which is better than hiding it.
 */
const forDisplay = (rows) =>
    rows
        .filter((r) => !r.removed || r.netPaise !== 0)
        .map(({ netPaise, ...r }) => r);

// A group's net positions must sum to zero. Anything else means the ledger is
// corrupt, and quietly returning wrong money is worse than failing loudly.
const assertBalanced = (ledger, groupId) => {
    if (ledger.drift !== 0) {
        throw new AppError(
            `Ledger inconsistency in group ${groupId}: balances are off by ${toRupees(
                ledger.drift
            )}`,
            500
        );
    }
};

/**
 * GET /group/:id/balances
 * Net position per member, plus the shortest set of payments that clears the
 * group. Everything derived on read — nothing stored, so nothing can drift.
 */
exports.getGroupBalances = catchAsync(async (req, res) => {
    const groupId = req.params.id;

    const group = await Group.findById(groupId);
    if (!group) throw new AppError("Group not found", 404);

    const ledger = (await loadLedgers([group._id])).get(String(group._id));
    assertBalanced(ledger, groupId);

    res.status(200).json({
        success: true,
        data: {
            groupId,
            totalGroupExpenses: toRupees(ledger.totalSpend),
            balances: forDisplay(ledger.rows),
            settlements: ledger.transfers.map(({ amountPaise, ...t }) => t),
        },
    });
});

/**
 * GET /user/:id/balances
 *
 * The home-screen view: what this person owes and is owed across every group
 * at once, plus a per-person roll-up.
 *
 * Note this is computed, never stored. Summing per-group figures into a cached
 * total is the same mistake as the stored balances we removed — it would drift
 * the first time an expense in any group changed.
 */
exports.getUserBalances = catchAsync(async (req, res) => {
    // Always the token holder — requireSelf already rejects another user's id.
    const userId = req.user._id;

    const groupIds = await visibleGroupIds(Group, userId);
    if (groupIds.length === 0) {
        return res.status(200).json({
            success: true,
            data: {
                userId,
                totalYouAreOwed: 0,
                totalYouOwe: 0,
                net: 0,
                groups: [],
                people: [],
            },
        });
    }

    const [groups, ledgers] = await Promise.all([
        Group.find({ _id: { $in: groupIds } }).sort({ createdAt: -1 }),
        loadLedgers(groupIds),
    ]);

    // Which member record represents this user, in each group.
    const myMemberships = await Member.find({
        userId,
        groupId: { $in: groupIds },
        removedAt: null,
    });
    const myMemberByGroup = new Map(
        myMemberships.map((m) => [String(m.groupId), String(m._id)])
    );

    const groupRows = [];
    // Roll suggested payments up per counterparty. Keyed on mobile number: the
    // same person has a separate member record in every group, and the number
    // is the only identifier that carries across them.
    const people = new Map();
    let owedToMe = 0;
    let iOwe = 0;

    for (const group of groups) {
        const gid = String(group._id);
        const ledger = ledgers.get(gid);
        if (!ledger) continue;
        assertBalanced(ledger, gid);

        const myMemberId = myMemberByGroup.get(gid);
        const myRow = myMemberId
            ? ledger.rows.find((r) => r.memberId === myMemberId)
            : null;

        groupRows.push({
            groupId: gid,
            title: group.title,
            isOwner: String(group.userId) === String(userId),
            // null when the user owns the group but isn't a participant in it.
            memberId: myMemberId || null,
            yourNet: myRow ? myRow.net : null,
            totalGroupExpenses: toRupees(ledger.totalSpend),
            memberCount: ledger.members.filter((m) => !m.removedAt).length,
        });

        if (!myRow) continue;
        if (myRow.netPaise > 0) owedToMe += myRow.netPaise;
        else iOwe += -myRow.netPaise;

        const memberById = new Map(ledger.members.map((m) => [String(m._id), m]));

        for (const t of ledger.transfers) {
            const iPay = t.fromMemberId === myMemberId;
            const iReceive = t.toMemberId === myMemberId;
            if (!iPay && !iReceive) continue;

            const otherId = iPay ? t.toMemberId : t.fromMemberId;
            const other = memberById.get(otherId);
            if (!other) continue;

            const key = other.mobileNo || otherId;
            if (!people.has(key)) {
                people.set(key, {
                    name: other.name,
                    mobileNo: other.mobileNo,
                    userId: other.userId ? String(other.userId) : null,
                    netPaise: 0,
                    groups: [],
                });
            }
            const entry = people.get(key);
            // Positive means they owe you. Netting across groups is the point:
            // owing ₹500 in one and being owed ₹200 in another is one ₹300 debt.
            entry.netPaise += iPay ? -t.amountPaise : t.amountPaise;
            entry.groups.push(group.title);
        }
    }

    const peopleRows = [...people.values()]
        .filter((p) => p.netPaise !== 0)
        .map((p) => ({
            name: p.name,
            mobileNo: p.mobileNo,
            userId: p.userId,
            direction: p.netPaise > 0 ? "owes_you" : "you_owe",
            amount: toRupees(Math.abs(p.netPaise)),
            groups: [...new Set(p.groups)],
        }))
        .sort((a, b) => b.amount - a.amount);

    res.status(200).json({
        success: true,
        data: {
            userId,
            totalYouAreOwed: toRupees(owedToMe),
            totalYouOwe: toRupees(iOwe),
            net: toRupees(owedToMe - iOwe),
            groups: groupRows,
            people: peopleRows,
        },
    });
});
