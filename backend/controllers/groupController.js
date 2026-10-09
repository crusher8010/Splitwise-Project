const Group = require("../models/groupModel");
const User = require("../models/userModel");
const Member = require("../models/membersModel");
const Expense = require("../models/expenseModel");
const { AppError, catchAsync } = require("../utils/appError");
const { toRupees } = require("../utils/money");
const { loadLedgers, visibleGroupIds } = require("../utils/ledger");

// POST /group  (and the legacy /group/createGroup/:id)
// The creator is whoever holds the token — never a value from the request.
exports.createGroup = catchAsync(async (req, res) => {
    const user = req.user;
    const userId = user._id;

    if (!req.body.title) throw new AppError("title is required", 400);

    const newGroup = await Group.create({ title: req.body.title, userId });

    // The creator is automatically the first member, linked back to their
    // account so we can tell which member "is" the logged-in user.
    try {
        await Member.create({
            name: `${user.firstName} ${user.lastName}`,
            mobileNo: user.mobileNo,
            groupId: newGroup._id,
            userId: user._id,
        });
    } catch (err) {
        await Group.findByIdAndDelete(newGroup._id);
        throw err;
    }

    res.status(201).json({ success: true, data: newGroup });
});

/**
 * GET /group  (and the legacy /group/getGroups/:id)
 *
 * Groups this user created AND groups they were added to. It used to filter on
 * Group.userId alone, so anyone who wasn't the creator saw an empty list — they
 * could owe money in a group they had no way to open.
 */
exports.getGroups = catchAsync(async (req, res) => {
    const userId = req.user._id;

    const groupIds = await visibleGroupIds(Group, userId);
    if (groupIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
    }

    const [groups, ledgers, memberships] = await Promise.all([
        Group.find({ _id: { $in: groupIds } }).sort({ createdAt: -1 }),
        loadLedgers(groupIds),
        Member.find({ userId, groupId: { $in: groupIds }, removedAt: null }),
    ]);
    const myMemberByGroup = new Map(
        memberships.map((m) => [String(m.groupId), String(m._id)])
    );

    res.status(200).json({
        success: true,
        data: groups.map((g) => {
            const gid = String(g._id);
            const ledger = ledgers.get(gid);
            const myMemberId = myMemberByGroup.get(gid);
            const myRow = myMemberId
                ? ledger?.rows.find((r) => r.memberId === myMemberId)
                : null;

            return {
                ...g.toObject(),
                isOwner: String(g.userId) === String(userId),
                memberId: myMemberId || null,
                yourNet: myRow ? myRow.net : null,
                memberCount: ledger
                    ? ledger.members.filter((m) => !m.removedAt).length
                    : 0,
                totalGroupExpenses: toRupees(ledger ? ledger.totalSpend : 0),
            };
        }),
    });
});

// GET /group/:id
exports.getGroup = catchAsync(async (req, res) => {
    const group = await Group.findById(req.params.id);
    if (!group) throw new AppError("Group not found", 404);

    res.status(200).json({ success: true, data: group });
});

// PATCH /group/patchGroup/:id
exports.editGroupName = catchAsync(async (req, res) => {
    if (!req.body.title) throw new AppError("title is required", 400);

    const updated = await Group.findByIdAndUpdate(
        req.params.id,
        { title: req.body.title },
        { new: true, runValidators: true }
    );
    if (!updated) throw new AppError("Group not found", 404);

    res.status(200).json({ success: true, data: updated });
});

// DELETE /group/:id — takes its members and its ledger with it.
exports.deleteGroup = catchAsync(async (req, res) => {
    const group = await Group.findByIdAndDelete(req.params.id);
    if (!group) throw new AppError("Group not found", 404);

    await Promise.all([
        Member.deleteMany({ groupId: req.params.id }),
        Expense.deleteMany({ groupId: req.params.id }),
    ]);

    res.status(200).json({ success: true, data: { id: req.params.id } });
});
