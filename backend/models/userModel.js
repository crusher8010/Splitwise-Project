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
        // Set when the account was created or linked through "Sign in with
        // Google". `sparse` so accounts without one don't collide on null.
        googleId: {
            type: String,
            unique: true,
            sparse: true,
        },
        password: {
            type: String,
            // Google-only accounts have no password.
            required: function () {
                return !this.googleId;
            },
            // Never returned unless a query explicitly asks with .select('+password')
            select: false,
        },
        // Unique because it's the key that links a person's account to the
        // member records other people created for them. Ambiguous numbers
        // would mean linking someone into a group they aren't in.
        // Optional only because Google doesn't supply it: those users add it
        // right after signing in (PATCH /users/me/mobile). `sparse` lets many
        // of them exist without one while real numbers stay unique.
        mobileNo: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
        },
        // No `expenses` / `paymentHistory` here either — a user's position is
        // per-group and derived from the expense ledger.

        passwordResetToken: {
            type: String,
            select: false,
        },
        passwordResetExpires: {
            type: Date,
            select: false
        }
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
