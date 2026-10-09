const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: true,
            trim: true,
        },
        lastName: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: true,
            // Never returned unless a query explicitly asks with .select('+password')
            select: false,
        },
        // Unique because it's the key that links a person's account to the
        // member records other people created for them. Ambiguous numbers
        // would mean linking someone into a group they aren't in.
        mobileNo: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        // No `expenses` / `paymentHistory` here either — a user's position is
        // per-group and derived from the expense ledger.
    },
    { timestamps: true }
);

// Strip the hash from anything serialised to JSON, belt-and-braces.
userSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.password;
        return ret;
    },
});

const User = mongoose.model("users", userSchema);
module.exports = User;
