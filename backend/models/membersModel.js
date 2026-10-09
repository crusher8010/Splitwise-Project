const mongoose = require("mongoose");

// A member is a participant in one group. It is deliberately NOT the same
// thing as a User: you can add someone who has never signed up. When the
// member does correspond to an account, `userId` links them.
//
// Note what is absent: `expenses` and `paymentHistory`. Balances are derived
// from the expense ledger (see utils/balances.js), never stored here.

const memberSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        mobileNo: {
            type: String,
            required: true,
            trim: true,
        },
        groupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "groups",
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            default: null,
        },
        // Leaving a group is a soft delete once the person has ledger history.
        //
        // A member who appears in even one expense cannot be erased: the
        // payer's outlay would stay while their share vanished, the group
        // would stop summing to zero, and every balance in it would be wrong.
        // So a settled member is marked removed instead — they keep answering
        // for their past expenses, but drop out of the roster, the balance
        // table and the pickers for new expenses.
        //
        // null means active. A member with no history at all is deleted for
        // real, because there is nothing to preserve.
        removedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// One person shouldn't appear twice in the same group. This deliberately
// counts removed members too: re-adding a number that is already here
// reactivates the original record rather than creating a second one, which
// keeps their old expenses attached to the person who incurred them.
memberSchema.index({ groupId: 1, mobileNo: 1 }, { unique: true });

const Members = mongoose.model("members", memberSchema);
module.exports = Members;
