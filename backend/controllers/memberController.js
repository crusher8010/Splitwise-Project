const Members = require("../models/membersModel");
const Group = require("../models/groupModel");
const User = require("../models/userModel");
const Expense = require("../models/expenseModel");
const { AppError, catchAsync } = require("../utils/appError");
const { toRupees } = require("../utils/money");
const { loadLedgers } = require("../utils/ledger");

// NOTE: the old `updateMember` endpoint is gone. It let the client push
// precomputed balances into the database, which is exactly the thing the
// expense ledger replaces. Balances now come from GET /group/:id/balances.

const present = (m) => ({
    _id: m._id,
    name: m.name,
    mobileNo: m.mobileNo,
    groupId: m.groupId,
    userId: m.userId,
    removed: Boolean(m.removedAt),
    removedAt: m.removedAt,
    createdAt: m.createdAt,
});

// POST /member/createMembers
exports.createMember = catchAsync(async (req, res) => {
    const { name, mobileNo, groupId } = req.body;

    if (!name || !mobileNo || !groupId) {
        throw new AppError("name, mobileNo and groupId are required", 400);
    }

    const group = await Group.findById(groupId);
    if (!group) throw new AppError("Group not found", 404);

    // The schema has a unique index on (groupId, mobileNo) — that's the real
    // guarantee against a race. This check just turns the duplicate into a
    // readable message instead of a raw driver error.
    const existing = await Members.findOne({ groupId, mobileNo });

    if (existing && !existing.removedAt) {
        throw new AppError(
            `${existing.name} is already in this group with that number`,
            409
        );
    }

    // Someone who left and is coming back reuses their original record rather
    // than getting a second one. Re-creating them would orphan every expense
    // still pointing at the old id, and the group would show two of the same
    // person — one holding all the history and one holding none.
    if (existing && existing.removedAt) {
        existing.removedAt = null;
        existing.name = name;
        if (!existing.userId) {
            const account = await User.findOne({ mobileNo: String(mobileNo) });
            existing.userId = account?._id || null;
        }
        await existing.save();

        return res.status(200).json({
            success: true,
            rejoined: true,
            data: present(existing),
        });
    }

    // The other half of the link: if this person already has an account, wire
    // the member record to it now so the group shows up in their list.
    // Signup handles the reverse case (added first, signed up later).
    const account = await User.findOne({ mobileNo: String(mobileNo) });

    const newMember = await Members.create({
        name,
        mobileNo,
        groupId,
        userId: account?._id || null,
    });

    res.status(201).json({ success: true, data: present(newMember) });
});

// GET /member/getAllMembers/:id   (:id = group)
//
// Active roster by default. `?includeRemoved=true` for the screens that need
// to render past members — an old expense still carries their name.
exports.getAllMembers = catchAsync(async (req, res) => {
    const includeRemoved = req.query.includeRemoved === "true";

    const filter = { groupId: req.params.id };
    if (!includeRemoved) filter.removedAt = null;

    const members = await Members.find(filter).sort({ createdAt: 1 });

    res.status(200).json({
        success: true,
        count: members.length,
        data: members.map(present),
    });
});

// PATCH /member/:id — renaming only. Money is never edited here.
exports.editMember = catchAsync(async (req, res) => {
    const target = req.targetMember || (await Members.findById(req.params.id));
    if (!target) throw new AppError("Member not found", 404);
    if (target.removedAt) {
        throw new AppError(
            `${target.name} is no longer in this group. Add them again to make changes.`,
            409
        );
    }

    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.mobileNo) updates.mobileNo = req.body.mobileNo;

    if (Object.keys(updates).length === 0) {
        throw new AppError("Provide a name or mobileNo to update", 400);
    }

    const member = await Members.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
    });
    if (!member) throw new AppError("Member not found", 404);

    res.status(200).json({ success: true, data: present(member) });
});

/**
 * DELETE /member/:id
 *
 * The rule is the balance, not the history: you can leave a group once you
 * are square with it. Owing ₹600, or being owed ₹600, is the one thing that
 * has to stop you — walking out mid-debt is how the money gets lost.
 *
 * What happens next depends on whether there is anything to preserve:
 *
 *   no expenses at all  -> delete the record outright, nothing references it
 *   settled, has history -> mark removed, keep the record
 *
 * The second case is not squeamishness. Every expense stores `paidBy` and a
 * `splits[].member`; erasing the row those point at would leave the payer's
 * outlay in the ledger with the matching share gone, the group would stop
 * summing to zero, and GET /group/:id/balances would (correctly) start
 * returning a 500 instead of wrong money. A removed member keeps answering
 * for their past expenses while dropping out of the roster, the balance
 * table, and the pickers for anything new.
 */
exports.deleteMember = catchAsync(async (req, res) => {
    const member = req.targetMember || (await Members.findById(req.params.id));
    if (!member) throw new AppError("Member not found", 404);

    if (member.removedAt) {
        throw new AppError(`${member.name} is already out of this group`, 409);
    }

    const ledger = (await loadLedgers([member.groupId])).get(
        String(member.groupId)
    );

    // Refuse on a corrupt ledger rather than reading someone's balance out of
    // numbers that are already wrong.
    if (ledger && ledger.drift !== 0) {
        throw new AppError(
            `Ledger inconsistency in group ${member.groupId}: balances are off by ${toRupees(
                ledger.drift
            )}`,
            500
        );
    }

    const row = ledger?.rows.find(
        (r) => r.memberId === String(member._id)
    );
    const netPaise = row ? row.netPaise : 0;

    if (netPaise !== 0) {
        const amount = toRupees(Math.abs(netPaise));
        throw new AppError(
            netPaise > 0
                ? `${member.name} is owed ₹${amount} in this group. Settle up before removing them.`
                : `${member.name} owes ₹${amount} in this group. Settle up before removing them.`,
            409
        );
    }

    const referenced = await Expense.countDocuments({
        groupId: member.groupId,
        $or: [{ paidBy: member._id }, { "splits.member": member._id }],
    });

    if (referenced === 0) {
        await Members.findByIdAndDelete(member._id);
        return res.status(200).json({
            success: true,
            data: { id: String(member._id), name: member.name, deleted: true },
        });
    }

    member.removedAt = new Date();
    await member.save();

    res.status(200).json({
        success: true,
        data: {
            id: String(member._id),
            name: member.name,
            deleted: false,
            removedAt: member.removedAt,
            keptForExpenses: referenced,
        },
    });
});
