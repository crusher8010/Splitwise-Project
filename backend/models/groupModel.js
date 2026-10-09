const mongoose = require("mongoose");

// `totalGroupExpenses` and `paymentHistory` are gone: both were stored
// aggregates that drifted from reality the moment an expense changed. Totals
// are computed from the expense ledger on read.

const groupSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: true,
            index: true,
        },
    },
    { timestamps: true }
);

const Group = mongoose.model("groups", groupSchema);
module.exports = Group;
