const Expense = require("../models/expenseModel");
const Group = require("../models/groupModel");
const Members = require("../models/membersModel");
const { AppError, catchAsync } = require("../utils/appError");
const { toPaise, toRupees, splitEqually } = require("../utils/money");
const { computeBalances, simplifyDebts } = require("../utils/balances");
const { visibleGroupIds } = require("../utils/ledger");

// Shape an expense for the client: paise back to rupees, ids resolved to names.
const present = (doc, memberNames) => ({
    _id: doc._id,
    groupId: doc.groupId,
    type: doc.type,
    description: doc.description,
    amount: toRupees(doc.amount),
    paidBy: doc.paidBy,
    paidByName: memberNames.get(String(doc.paidBy)) || null,
    splitType: doc.splitType,
    splits: doc.splits.map((s) => ({
        member: s.member,
        name: memberNames.get(String(s.member)) || null,
        share: toRupees(s.share),
    })),
    date: doc.date,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
});

const loadGroupMembers = async (groupId) => {
    const group = await Group.findById(groupId);
    if (!group) throw new AppError("Group not found", 404);

    const members = await Members.find({ groupId }).sort({ createdAt: 1 });
    const names = new Map(members.map((m) => [String(m._id), m.name]));
    // `members` is everyone the ledger has ever known — balances must reduce
    // over all of them or the group stops summing to zero. `active` is who can
    // still be put on something new.
    const active = members.filter((m) => !m.removedAt);
    return { group, members, active, names };
};

/**
 * POST /expense
 *
 * Body (all amounts in rupees):
 *   groupId, description, amount, paidBy, createdBy
 *   splitType: 'equal' (default) | 'exact'
 *   participants: [memberId]            when splitType is 'equal'
 *   splits: [{ member, share }]         when splitType is 'exact'
 */
exports.createExpense = catchAsync(async (req, res) => {
    const {
        groupId,
        description,
        amount,
        paidBy,
        splitType = "equal",
        participants,
        splits,
    } = req.body;

    // Recorded by whoever holds the token. A `createdBy` in the body is
    // ignored — it used to let a caller attribute an expense to anyone.
    const createdBy = req.user._id;

    if (!groupId || !description || amount === undefined || !paidBy) {
        throw new AppError(
            "groupId, description, amount and paidBy are required",
            400
        );
    }
    if (!["equal", "exact"].includes(splitType)) {
        throw new AppError("splitType must be 'equal' or 'exact'", 400);
    }

    const amountPaise = toPaise(amount);
    if (amountPaise <= 0) throw new AppError("Amount must be greater than zero", 400);

    const { active } = await loadGroupMembers(groupId);
    const memberIds = new Set(active.map((m) => String(m._id)));

    if (!memberIds.has(String(paidBy))) {
        throw new AppError("paidBy is not a current member of this group", 400);
    }

    let resolvedSplits;

    if (splitType === "equal") {
        // Default to the whole group when the caller doesn't narrow it down.
        const ids = Array.isArray(participants) && participants.length
            ? participants.map(String)
            : active.map((m) => String(m._id));

        for (const id of ids) {
            if (!memberIds.has(id)) {
                throw new AppError(
                    `Member ${id} is not a current member of this group`,
                    400
                );
            }
        }
        resolvedSplits = splitEqually(amountPaise, ids, paidBy);
    } else {
        if (!Array.isArray(splits) || splits.length === 0) {
            throw new AppError("splitType 'exact' requires a non-empty splits array", 400);
        }
        resolvedSplits = splits.map((s) => {
            if (!s || !s.member) throw new AppError("Every split needs a 'member'", 400);
            if (!memberIds.has(String(s.member))) {
                throw new AppError(
                    `Member ${s.member} is not a current member of this group`,
                    400
                );
            }
            return { member: String(s.member), share: toPaise(s.share, "share") };
        });

        // Surface the mismatch in rupees — the model guards it again in paise,
        // but a message about paise would be baffling to whoever sent rupees.
        const total = resolvedSplits.reduce((sum, s) => sum + s.share, 0);
        if (total !== amountPaise) {
            throw new AppError(
                `Splits add up to ${toRupees(total)} but the expense is ${toRupees(
                    amountPaise
                )}`,
                400
            );
        }
    }

    const expense = await Expense.create({
        groupId,
        type: "expense",
        description,
        amount: amountPaise,
        paidBy,
        splits: resolvedSplits,
        splitType,
        createdBy,
        date: req.body.date || Date.now(),
    });

    const { names } = await loadGroupMembers(groupId);
    res.status(201).json({ success: true, data: present(expense, names) });
});

/**
 * POST /settlement
 *
 * Records a repayment: `fromMemberId` hands `amount` to `toMemberId`.
 *
 * Structurally this is just an expense with a single split, which is why it
 * lives in the same collection — balances reduce over one stream and a
 * repayment pulls both sides toward zero with no special-casing. The only
 * difference is `type`, which keeps repayments out of "what did we spend".
 */
exports.createSettlement = catchAsync(async (req, res) => {
    const { groupId, fromMemberId, toMemberId, amount } = req.body;
    const createdBy = req.user._id;

    if (!groupId || !fromMemberId || !toMemberId || amount === undefined) {
        throw new AppError(
            "groupId, fromMemberId, toMemberId and amount are required",
            400
        );
    }
    if (String(fromMemberId) === String(toMemberId)) {
        throw new AppError("A member cannot settle up with themselves", 400);
    }

    const amountPaise = toPaise(amount);
    if (amountPaise <= 0) throw new AppError("Amount must be greater than zero", 400);

    const { members, active, names } = await loadGroupMembers(groupId);
    const memberIds = new Set(active.map((m) => String(m._id)));

    if (!memberIds.has(String(fromMemberId))) {
        throw new AppError("fromMemberId is not a current member of this group", 400);
    }
    if (!memberIds.has(String(toMemberId))) {
        throw new AppError("toMemberId is not a current member of this group", 400);
    }

    const settlement = await Expense.create({
        groupId,
        type: "settlement",
        description:
            req.body.description ||
            `${names.get(String(fromMemberId))} paid ${names.get(String(toMemberId))}`,
        amount: amountPaise,
        paidBy: fromMemberId,
        splits: [{ member: toMemberId, share: amountPaise }],
        splitType: "exact",
        createdBy,
        date: req.body.date || Date.now(),
    });

    // Hand back the resulting position so the caller can see the effect without
    // a second round trip — over- and under-payment are both legal, and the
    // client needs to know which it just made.
    const expenses = await Expense.find({ groupId });
    const { rows } = computeBalances(members, expenses);

    res.status(201).json({
        success: true,
        data: present(settlement, names),
        balances: rows.map(({ netPaise, ...r }) => r),
        settlements: simplifyDebts(rows).map(({ amountPaise: _p, ...t }) => t),
    });
});

// GET /expense/group/:id       ?type=expense|settlement to narrow it down
exports.getGroupExpenses = catchAsync(async (req, res) => {
    const { names } = await loadGroupMembers(req.params.id);

    const filter = { groupId: req.params.id };
    if (req.query.type) {
        if (!["expense", "settlement"].includes(req.query.type)) {
            throw new AppError("type must be 'expense' or 'settlement'", 400);
        }
        filter.type = req.query.type;
    }

    const expenses = await Expense.find(filter).sort({
        date: -1,
        createdAt: -1,
    });

    const total = expenses
        .filter((e) => e.type === "expense")
        .reduce((sum, e) => sum + e.amount, 0);

    res.status(200).json({
        success: true,
        count: expenses.length,
        totalGroupExpenses: toRupees(total),
        data: expenses.map((e) => present(e, names)),
    });
});

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

/**
 * GET /expense/mine
 *
 * Every ledger entry this person is actually part of, across every group they
 * can see, bucketed by month — the "what did I spend" view that the per-group
 * feed can't give you.
 *
 * Two things make it different from GET /expense/group/:id:
 *
 *   - It is filtered to entries where the caller either paid or holds a split.
 *     A dinner between three flatmates that the caller sat out is not their
 *     expense and does not belong on their statement.
 *   - Every row carries *their* number, not the group's. `yourShare` is what
 *     they consumed, `yourNet` is what the entry did to their position, and
 *     the month totals add those up. The group's total spend is a different
 *     question and is answered elsewhere.
 *
 * Settlements are included — a repayment is part of the month's story — but
 * they are excluded from `yourShare`, because handing somebody ₹500 back is
 * not consumption. Filter them out entirely with ?type=expense.
 *
 * Query: type=expense|settlement, limit (default 250, max 1000)
 */
exports.getMyExpenses = catchAsync(async (req, res) => {
    const userId = req.user._id;

    const empty = {
        success: true,
        count: 0,
        totals: { yourShare: 0, youPaid: 0, yourNet: 0, entries: 0 },
        data: [],
    };

    const groupIds = await visibleGroupIds(Group, userId);
    if (groupIds.length === 0) return res.status(200).json(empty);

    const [groups, myMemberships, allMembers] = await Promise.all([
        Group.find({ _id: { $in: groupIds } }).select("title"),
        Members.find({ userId, groupId: { $in: groupIds }, removedAt: null }),
        Members.find({ groupId: { $in: groupIds } }).select("name"),
    ]);

    // A group the caller owns but never joined has no member record, so there
    // is nothing of theirs in it to report.
    const myIds = myMemberships.map((m) => m._id);
    if (myIds.length === 0) return res.status(200).json(empty);

    const mine = new Set(myIds.map(String));
    const names = new Map(allMembers.map((m) => [String(m._id), m.name]));
    const titles = new Map(groups.map((g) => [String(g._id), g.title]));

    const filter = {
        groupId: { $in: groupIds },
        $or: [{ paidBy: { $in: myIds } }, { "splits.member": { $in: myIds } }],
    };
    if (req.query.type) {
        if (!["expense", "settlement"].includes(req.query.type)) {
            throw new AppError("type must be 'expense' or 'settlement'", 400);
        }
        filter.type = req.query.type;
    }

    const limit = Math.min(Number(req.query.limit) || 250, 1000);

    const expenses = await Expense.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .limit(limit);

    // Buckets keep insertion order, and the query is already newest-first, so
    // the months come out newest-first without a second sort.
    const buckets = new Map();
    let yourShare = 0;
    let youPaid = 0;

    for (const e of expenses) {
        const paidByYou = mine.has(String(e.paidBy));
        const share = e.splits
            .filter((sp) => mine.has(String(sp.member)))
            .reduce((sum, sp) => sum + sp.share, 0);

        // What this entry did to the caller's position: money out minus what
        // they consumed. Positive means they are further ahead for it.
        const net = (paidByYou ? e.amount : 0) - share;
        const settlement = e.type === "settlement";

        if (!settlement) {
            yourShare += share;
            if (paidByYou) youPaid += e.amount;
        }

        const date = e.date || e.createdAt;
        const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

        if (!buckets.has(key)) {
            buckets.set(key, {
                month: key,
                label: `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
                yourSharePaise: 0,
                youPaidPaise: 0,
                entries: [],
            });
        }
        const bucket = buckets.get(key);
        if (!settlement) {
            bucket.yourSharePaise += share;
            if (paidByYou) bucket.youPaidPaise += e.amount;
        }

        bucket.entries.push({
            _id: e._id,
            groupId: e.groupId,
            groupTitle: titles.get(String(e.groupId)) || null,
            type: e.type,
            description: e.description,
            date: e.date,
            amount: toRupees(e.amount),
            paidBy: e.paidBy,
            paidByName: names.get(String(e.paidBy)) || null,
            paidByYou,
            splitType: e.splitType,
            yourShare: toRupees(share),
            yourNet: toRupees(net),
            // What the row should say on the right, in one word.
            direction: settlement
                ? paidByYou
                    ? "paid"
                    : "received"
                : net > 0
                ? "lent"
                : net < 0
                ? "borrowed"
                : "even",
        });
    }

    const months = [...buckets.values()].map(
        ({ yourSharePaise, youPaidPaise, ...b }) => ({
            ...b,
            yourShare: toRupees(yourSharePaise),
            youPaid: toRupees(youPaidPaise),
            count: b.entries.length,
        })
    );

    res.status(200).json({
        success: true,
        count: expenses.length,
        // Only over what was returned — say so rather than implying all time.
        truncated: expenses.length === limit,
        totals: {
            yourShare: toRupees(yourShare),
            youPaid: toRupees(youPaid),
            yourNet: toRupees(youPaid - yourShare),
            entries: expenses.length,
        },
        data: months,
    });
});

// GET /expense/:id
exports.getExpense = catchAsync(async (req, res) => {
    const expense = await Expense.findById(req.params.id);
    if (!expense) throw new AppError("Expense not found", 404);

    const { names } = await loadGroupMembers(expense.groupId);
    res.status(200).json({ success: true, data: present(expense, names) });
});

// DELETE /expense/:id — expenses are immutable, so correcting one means
// deleting and re-adding. Balances recompute automatically.
exports.deleteExpense = catchAsync(async (req, res) => {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) throw new AppError("Expense not found", 404);

    res.status(200).json({ success: true, data: { id: req.params.id } });
});
