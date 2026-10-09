const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const Members = require("../models/membersModel");
const { AppError, catchAsync } = require("../utils/appError");

const SALT_ROUNDS = 12;
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || "1h";

// Read the secret lazily so it is never captured as undefined at import time.
const jwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not configured");
    return secret;
};

// Only ever put identifiers in the token — the payload is base64, not encrypted.
const signToken = (user) =>
    jwt.sign({ id: user._id.toString(), email: user.email }, jwtSecret(), {
        expiresIn: TOKEN_TTL,
    });

exports.createUser = catchAsync(async (req, res) => {
    const { firstName, lastName, email, password, mobileNo } = req.body;

    if (!firstName || !lastName || !email || !password || !mobileNo) {
        throw new AppError(
            "firstName, lastName, email, password and mobileNo are all required",
            400
        );
    }
    if (String(password).length < 8) {
        throw new AppError("Password must be at least 8 characters", 400);
    }

    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) {
        throw new AppError("An account with that email already exists", 409);
    }

    const phoneTaken = await User.findOne({ mobileNo: String(mobileNo) });
    if (phoneTaken) {
        throw new AppError("An account with that mobile number already exists", 409);
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const newUser = await User.create({
        firstName,
        lastName,
        email,
        mobileNo,
        password: hashed,
        expenses: 0,
        paymentHistory: [],
    });

    // Somebody may have already added this person to a group by phone number
    // before they signed up. Adopt those member records now, so their groups
    // are waiting for them the first time they log in.
    const linked = await Members.updateMany(
        { mobileNo: String(mobileNo), userId: null },
        { $set: { userId: newUser._id } }
    );

    res.status(201).json({
        success: true,
        data: newUser, // toJSON strips the hash
        token: signToken(newUser),
        linkedGroups: linked.modifiedCount || 0,
    });
});

exports.checkUser = catchAsync(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new AppError("Email and password are required", 400);
    }

    const user = await User.findOne({ email: String(email).toLowerCase() }).select(
        "+password"
    );

    // Same response whether the email is unknown or the password is wrong,
    // so the endpoint can't be used to enumerate accounts. Compare against a
    // dummy hash on the miss path to keep the timing comparable.
    const hash =
        user?.password ||
        "$2b$12$0000000000000000000000000000000000000000000000000000";
    const ok = await bcrypt.compare(password, hash);

    if (!user || !ok) {
        throw new AppError("Invalid credentials", 401);
    }

    const safeUser = user.toObject();
    delete safeUser.password;

    res.status(200).json({
        success: true,
        data: safeUser,
        token: signToken(user),
    });
});

exports.getMe = catchAsync(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);

    res.status(200).json({ success: true, data: user });
});
