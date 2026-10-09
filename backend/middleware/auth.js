const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const Group = require("../models/groupModel");
const Member = require("../models/membersModel");
const Expense = require("../models/expenseModel");
const { AppError, catchAsync } = require("../utils/appError");

/**
 * Verify the bearer token and attach the account to the request.
 *
 * Everything downstream takes identity from req.user, never from the request
 * body — otherwise a caller could simply claim to be someone else, which is
 * exactly what `createdBy`/`paidBy` in the body used to allow.
 */
exports.protect = catchAsync(async (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

    if (!token) {
        throw new AppError("You are not logged in. Send a Bearer token.", 401);
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            throw new AppError("Your session has expired. Please log in again.", 401);
        }
        throw new AppError("Invalid token.", 401);
    }

    // Re-read the account: a token stays valid until it expires, so a deleted
    // user would otherwise keep working with a token issued before deletion.
    const user = await User.findById(decoded.id);
    if (!user) {
        throw new AppError("The account for this token no longer exists.", 401);
    }

    req.user = user;
    next();
});

/**
 * The :id in the URL must be the caller. These routes predate auth and take a
 * user id as a path param; rather than silently trusting it, we require it to
 * match the token so /user/<someone-else>/balances can't be read.
 */
exports.requireSelf = (param = "id") =>
    catchAsync(async (req, res, next) => {
        if (String(req.params[param]) !== String(req.user._id)) {
            throw new AppError("You can only access your own account.", 403);
        }
        next();
    });

const findGroupId = (req, sources) => {
    for (const [where, key] of sources) {
        const value = req[where]?.[key];
        if (value) return value;
    }
    return null;
};

/**
 * The caller must belong to the group they're touching — as its creator or as
 * a member. Attaches req.group and req.member (the member record representing
 * this user in that group) so controllers don't re-query.
 */
exports.requireGroupAccess = (
    sources = [["params", "id"], ["body", "groupId"]]
) =>
    catchAsync(async (req, res, next) => {
        const groupId = findGroupId(req, sources);
        if (!groupId) throw new AppError("groupId is required", 400);

        const group = await Group.findById(groupId);
        if (!group) throw new AppError("Group not found", 404);

        const member = await Member.findOne({
        groupId: group._id,
        userId: req.user._id,
        removedAt: null,
    });
        const isOwner = String(group.userId) === String(req.user._id);

        if (!member && !isOwner) {
            throw new AppError("You are not a member of this group.", 403);
        }

        req.group = group;
        req.member = member || null;
        req.isGroupOwner = isOwner;
        next();
    });

// Destructive, group-wide actions stay with whoever created it.
exports.requireGroupOwner = catchAsync(async (req, res, next) => {
    if (!req.isGroupOwner) {
        throw new AppError("Only the group's creator can do that.", 403);
    }
    next();
});

/**
 * For routes keyed by an expense id: load it, then apply the group check.
 * The group isn't in the URL, so it has to come from the expense itself.
 */
exports.requireExpenseAccess = catchAsync(async (req, res, next) => {
    const expense = await Expense.findById(req.params.id);
    if (!expense) throw new AppError("Expense not found", 404);

    const group = await Group.findById(expense.groupId);
    if (!group) throw new AppError("Group not found", 404);

    const member = await Member.findOne({
        groupId: group._id,
        userId: req.user._id,
        removedAt: null,
    });
    const isOwner = String(group.userId) === String(req.user._id);
    if (!member && !isOwner) {
        throw new AppError("You are not a member of this group.", 403);
    }

    req.expense = expense;
    req.group = group;
    req.member = member || null;
    req.isGroupOwner = isOwner;
    next();
});

/** Same check, keyed by a member id (for rename / remove). */
exports.requireMemberAccess = catchAsync(async (req, res, next) => {
    const target = await Member.findById(req.params.id);
    if (!target) throw new AppError("Member not found", 404);

    const group = await Group.findById(target.groupId);
    if (!group) throw new AppError("Group not found", 404);

    const member = await Member.findOne({
        groupId: group._id,
        userId: req.user._id,
        removedAt: null,
    });
    const isOwner = String(group.userId) === String(req.user._id);
    if (!member && !isOwner) {
        throw new AppError("You are not a member of this group.", 403);
    }

    req.targetMember = target;
    req.group = group;
    req.isGroupOwner = isOwner;
    next();
});
