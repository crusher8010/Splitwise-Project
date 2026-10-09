const mongoose = require("mongoose");

// One immutable financial fact. Balances are derived by reducing over these,
// never stored — that is what makes edit, delete and audit possible.
//
// `amount` and `share` are INTEGER PAISE. See utils/money.js.

const splitSchema = new mongoose.Schema(
    {
        member: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "members",
            required: true,
        },
        share: {
            type: Number,
            required: true,
            min: [0, "A split share cannot be negative"],
            validate: {
                validator: Number.isInteger,
                message: "share must be an integer number of paise",
            },
        },
    },
    { _id: false }
);

const expenseSchema = new mongoose.Schema(
    {
        groupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "groups",
            required: true,
            index: true,
        },
        // A settlement is the same shape as an expense: one payer, one split.
        // Keeping them in one collection means balances reduce over a single
        // stream instead of reconciling two.
        type: {
            type: String,
            enum: ["expense", "settlement"],
            default: "expense",
        },
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: [200, "Description is too long"],
        },
        amount: {
            type: Number,
            required: true,
            min: [1, "Amount must be greater than zero"],
            validate: {
                validator: Number.isInteger,
                message: "amount must be an integer number of paise",
            },
        },
        paidBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "members",
            required: true,
            index: true,
        },
        splits: {
            type: [splitSchema],
            required: true,
            validate: {
                validator: (v) => Array.isArray(v) && v.length > 0,
                message: "An expense needs at least one split",
            },
        },
        splitType: {
            type: String,
            enum: ["equal", "exact"],
            default: "equal",
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: true,
        },
        date: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

expenseSchema.index({ groupId: 1, date: -1 });

// The invariant the whole ledger rests on. If splits don't sum to the amount,
// group balances stop summing to zero and settlement output becomes nonsense.
const validationError = (message) => {
    const err = new Error(message);
    err.name = "ValidationError";
    err.errors = { splits: { message } };
    return err;
};

expenseSchema.pre("validate", function (next) {
    if (!Array.isArray(this.splits) || this.splits.length === 0) return next();

    const total = this.splits.reduce((sum, s) => sum + (s.share || 0), 0);
    if (total !== this.amount) {
        return next(
            validationError(
                `Splits total ${total} paise but the amount is ${this.amount} paise`
            )
        );
    }

    const ids = this.splits.map((s) => String(s.member));
    if (new Set(ids).size !== ids.length) {
        return next(validationError("A member appears more than once in splits"));
    }

    next();
});

const Expense = mongoose.model("expenses", expenseSchema);
module.exports = Expense;
