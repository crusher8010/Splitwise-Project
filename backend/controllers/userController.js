const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const Members = require("../models/membersModel");
const { AppError, catchAsync } = require("../utils/appError");
const { sendEmail } = require("../utils/email");
const googleClient = new OAuth2Client();

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

exports.forgotPassword = catchAsync(async (req, res) => {
    const { email } = req.body;

    if(!email){
        res.status(400).json({
            success: false,
            message: "Invalid request. Please provide an email address!"
        })
    };

    const user = await User.findOne({email: String(email).toLowerCase()});

    if(user){
        let token = crypto.randomBytes(32).toString("hex");
        let hashedToken = crypto.createHash("sha256").update(token).digest("hex");

        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 minutes

        await user.save({ validateBeforeSave: false });

        const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;

        try {
            await sendEmail({
                to: user.email,
                subject: "Reset your Tally password",
                text: `Hi ${user.firstName},\n\nUse this link to reset your password. It expires in 15 minutes:\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
            });
        } catch (err) {
            // Don't leave a usable token behind if the email never went out.
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            await user.save({ validateBeforeSave: false });
            throw new AppError("Could not send the reset email. Try again later.", 500);
        }
    }else{
        res.status(404).json({
            success: false,
            message: "User with this email address does not exist!"
        })
    }
})

exports.resetPassword = catchAsync(async (req, res) => {
    const {password} = req.body;

    if (typeof password !== "string" || !password) {
        throw new AppError("Please provide a new password", 400);
    }
    if (password.length < 8) {
        throw new AppError("Password must be at least 8 characters", 400);
    }

    const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

    const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
        throw new AppError("Token is invalid or has expired", 400);
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    user.password = hashed;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    res.status(200).json({
        success: true,
        message: "Password has been reset successfully!"
    })
})

// POST /users/google  { credential }
// Sign up or log in with a Google ID token. The token is verified with Google
// (signature + audience), so nothing about who the user is comes from us
// trusting the client.
exports.googleAuth = catchAsync(async (req, res) => {
    const { credential } = req.body;
    if (typeof credential !== "string" || !credential) {
        throw new AppError("Google credential is required", 400);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured");

    let payload;
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: clientId,
        });
        payload = ticket.getPayload();
    } catch {
        throw new AppError("Invalid Google credential", 401);
    }

    if (!payload?.email || !payload.email_verified) {
        throw new AppError("Your Google account email is not verified", 401);
    }

    const email = payload.email.toLowerCase();
    let isNewUser = false;

    let user = await User.findOne({ googleId: payload.sub });

    if (!user) {
        user = await User.findOne({ email });

        if (user) {
            // Same verified email as an existing account: link, don't duplicate.
            user.googleId = payload.sub;
            await user.save({ validateBeforeSave: false });
        } else {
            user = await User.create({
                googleId: payload.sub,
                email,
                firstName: payload.given_name || payload.name || email.split("@")[0],
                lastName: payload.family_name || "-",
            });
            isNewUser = true;
        }
    }

    res.status(isNewUser ? 201 : 200).json({
        success: true,
        data: user,
        token: signToken(user),
        isNewUser,
        // Google doesn't give us a phone number; the client must collect it.
        needsMobile: !user.mobileNo,
    });
});

// PATCH /users/me/mobile  { mobileNo }  (protected)
// Second step for Google sign-ups: attach the mobile number and adopt any
// group memberships created for that number before they joined.
exports.setMobile = catchAsync(async (req, res) => {
    const mobileNo = String(req.body.mobileNo || "").trim();
    if (!mobileNo) throw new AppError("mobileNo is required", 400);

    if (req.user.mobileNo) {
        throw new AppError("Mobile number is already set", 409);
    }

    const phoneTaken = await User.findOne({ mobileNo });
    if (phoneTaken) {
        throw new AppError("An account with that mobile number already exists", 409);
    }

    req.user.mobileNo = mobileNo;
    await req.user.save();

    const linked = await Members.updateMany(
        { mobileNo, userId: null },
        { $set: { userId: req.user._id } }
    );

    res.status(200).json({
        success: true,
        data: req.user,
        linkedGroups: linked.modifiedCount || 0,
    });
});
