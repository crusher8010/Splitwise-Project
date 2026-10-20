const express = require("express");
const {
    createUser,
    checkUser,
    getMe,
    forgotPassword,
    resetPassword,
} = require("../controllers/userController");
const { getUserBalances } = require("../controllers/balanceController");
const { protect, requireSelf } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

// Public. Login is throttled per IP so the endpoint can't be used to grind
// passwords; signup is throttled more loosely to slow account spam.
router.route("/signup").post(
    rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }),
    createUser
);
router.route("/login").post(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        message: "Too many login attempts. Try again shortly.",
    }),
    checkUser
);

// Password reset. The request is tightly throttled so it can't be used to
// spam someone's inbox; the reset itself is throttled to slow token guessing.
router.route("/forgot-password").post(
    rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 5,
        message: "Too many reset requests. Try again later.",
    }),
    forgotPassword
);
router.route("/reset-password/:token").patch(
    rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }),
    resetPassword
);

// Everything below needs a valid token.
router.use(protect);

router.route("/me").get((req, res) => {
    res.status(200).json({ success: true, data: req.user });
});
router.route("/me/balances").get(getUserBalances);

// Legacy id-in-the-path forms — the id must be the caller's own.
router.route("/:id/balances").get(requireSelf(), getUserBalances);
router.route("/:id").get(requireSelf(), getMe);

module.exports = router;
