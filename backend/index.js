const dotenv = require("dotenv");
// Must run before any module that reads process.env at load time.
dotenv.config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const userRoute = require("./routes/userRoutes");
const groupRoute = require("./routes/groupRoutes");
const memberRoute = require("./routes/memberRoutes");
const expenseRoute = require("./routes/expenseRoutes");
const settlementRoute = require("./routes/settlementRoutes");

const REQUIRED_ENV = ["MONGO_URL", "JWT_SECRET"];
const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
}

const app = express();

// Behind a proxy (Render, Heroku, nginx) req.ip is the proxy's address unless
// Express is told to read X-Forwarded-For — which would make the login rate
// limiter bucket every user together. Off by default: trusting the header
// when you are NOT behind a proxy lets a caller spoof their own IP.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

app.use(express.json({ limit: "100kb" }));
app.use(
    cors({
        origin: process.env.CORS_ORIGIN || "*",
    })
);

app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        data: { uptime: process.uptime(), db: mongoose.connection.readyState },
    });
});

app.use("/user", userRoute);
app.use("/group", groupRoute);
app.use("/member", memberRoute);
app.use("/expense", expenseRoute);
app.use("/settlement", settlementRoute);

// Unknown route -> 404 instead of hanging.
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`,
    });
});

// Central error handler. Controllers call next(err); nothing is swallowed.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error(err);

    if (err.name === "ValidationError") {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: Object.values(err.errors).map((e) => e.message),
        });
    }
    if (err.name === "CastError") {
        return res.status(400).json({
            success: false,
            message: `Invalid ${err.path}: ${err.value}`,
        });
    }
    if (err.code === 11000) {
        return res.status(409).json({
            success: false,
            message: `Duplicate value for ${Object.keys(err.keyValue).join(", ")}`,
        });
    }

    res.status(err.statusCode || 500).json({
        success: false,
        message: err.statusCode ? err.message : "Internal Server Error",
    });
});

const port = process.env.PORT || 8000;

mongoose
    .connect(process.env.MONGO_URL)
    .then(() => {
        console.log("Successfully connected database");
        app.listen(port, () => console.log(`Server running on port ${port}`));
    })
    .catch((err) => {
        console.error("Database connection failed:", err.message);
        process.exit(1);
    });

module.exports = app;
