/**
 * Drop everything, build a realistic scenario, and verify the ledger.
 *
 *   node seed.js            seed + verify   (WIPES the database in MONGO_URL)
 *   node seed.js --keep     verify only, leaves existing data alone
 *
 * This talks to the real database over the real HTTP API — same routes, same
 * controllers, same Mongoose queries the app uses in production. If this
 * passes, the backend works end to end.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const KEEP = process.argv.includes("--keep");
const PORT = process.env.PORT || 8000;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${extra ? `\n      ${extra}` : ""}`); }
};
const rs = (n) => `₹${Number(n).toFixed(2)}`;

// Every request carries the current identity's bearer token. `as(token)`
// switches who we are; `as(null)` makes an anonymous request.
let authToken = null;
const as = (token) => { authToken = token; };

const call = async (method, path, body) => {
    const headers = { "Content-Type": "application/json" };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const res = await fetch(BASE + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch (_) {}
    if (!json) throw new Error(`${method} ${path} returned no JSON (status ${res.status})`);
    return { status: res.status, json };
};

const must = async (method, path, body) => {
    const r = await call(method, path, body);
    if (r.status >= 400) {
        throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(r.json)}`);
    }
    return r.json.data;
};

(async () => {
    // index.js connects to Mongo and starts listening.
    require("./index");

    await new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = setInterval(() => {
            if (mongoose.connection.readyState === 1) { clearInterval(tick); resolve(); }
            else if (Date.now() - started > 30000) {
                clearInterval(tick); reject(new Error("Timed out connecting to MongoDB"));
            }
        }, 200);
    });
    console.log(`\nConnected to ${mongoose.connection.name}\n`);

    // The app logs every error it handles. This script deliberately sends bad
    // requests, so those stack traces are expected noise — capture them and
    // only replay them if something actually went wrong.
    const appErrors = [];
    const realError = console.error;
    console.error = (...args) => appErrors.push(args);

    if (!KEEP) {
        console.log("--- dropping collections ---");
        for (const name of ["users", "groups", "members", "expenses"]) {
            try {
                await mongoose.connection.db.collection(name).drop();
                console.log(`  dropped ${name}`);
            } catch (err) {
                // 26 = NamespaceNotFound: the collection was never created.
                if (err.code === 26) console.log(`  ${name} (did not exist)`);
                else throw err;
            }
        }
        // Recreate indexes the schemas declare (unique email, unique member).
        await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes()));
        console.log("  indexes rebuilt\n");
    }

    const stamp = Date.now();
    // Mobile numbers are unique per account, so stamp them — otherwise a second
    // run with --keep would collide with the first.
    const phone = (n) => `9${String(stamp).slice(-8)}${n}`;

    console.log("--- creating users ---");
    const signupRes = await call("POST", "/user/signup", {
        firstName: "Yogesh", lastName: "Chouhan",
        email: `yogesh+${stamp}@example.com`,
        password: "correct-horse-battery", mobileNo: phone(1),
    });
    if (signupRes.status >= 400) throw new Error(JSON.stringify(signupRes.json));
    const yogesh = signupRes.json.data;
    const yogeshToken = signupRes.json.token;
    as(yogeshToken);
    console.log(`  ${yogesh.firstName} ${yogesh.lastName}  (${yogesh._id})`);
    check("signup returns no password hash", yogesh.password === undefined);

    const login = await call("POST", "/user/login", {
        email: `yogesh+${stamp}@example.com`, password: "correct-horse-battery",
    });
    check("login works", login.status === 200, JSON.stringify(login.json));
    check("login issues a token", !!login.json.token);
    check("token carries no password hash",
        !Buffer.from(String(login.json.token).split(".")[1], "base64")
            .toString().includes("$2b$"));
    check("wrong password is rejected",
        (await call("POST", "/user/login", {
            email: `yogesh+${stamp}@example.com`, password: "wrong-password-here",
        })).status === 401);
    check("unknown email is rejected, not hung",
        (await call("POST", "/user/login", {
            email: `nobody+${stamp}@example.com`, password: "whatever12345",
        })).status === 401);

    console.log("\n--- creating a group ---");
    const group = await must("POST", `/group/createGroup/${yogesh._id}`, { title: "Goa Trip" });
    const G = group._id;
    console.log(`  "${group.title}"  (${G})`);

    let members = await must("GET", `/member/getAllMembers/${G}`);
    check("creator auto-added as a member", members.length === 1);
    check("that member is linked to the user account",
        String(members[0].userId) === String(yogesh._id));
    const mYogesh = members[0]._id;

    // Added by phone number before either has an account.
    const asha = await must("POST", "/member/createMembers",
        { name: "Asha", mobileNo: phone(2), groupId: G });
    const mAsha = asha._id;
    const mRavi = (await must("POST", "/member/createMembers",
        { name: "Ravi", mobileNo: phone(3), groupId: G }))._id;
    console.log("  members: Yogesh Chouhan, Asha, Ravi");
    check("member added before signup has no account link", asha.userId === null);

    check("duplicate member in the same group is rejected",
        (await call("POST", "/member/createMembers",
            { name: "Asha again", mobileNo: phone(2), groupId: G })).status === 409);

    console.log("\n--- account linking ---");
    // Asha signs up AFTER being added: her member record should be adopted.
    as(null);
    const ashaSignup = await call("POST", "/user/signup", {
        firstName: "Asha", lastName: "Kulkarni", email: `asha+${stamp}@example.com`,
        password: "correct-horse-battery", mobileNo: phone(2),
    });
    if (ashaSignup.status >= 400) throw new Error(JSON.stringify(ashaSignup.json));
    const ashaUser = ashaSignup.json.data;
    const ashaToken = ashaSignup.json.token;
    check("signup reports how many groups were adopted",
        ashaSignup.json.linkedGroups === 1, `got ${ashaSignup.json.linkedGroups}`);

    as(ashaToken);
    const ashaGroups = await must("GET", `/group/getGroups/${ashaUser._id}`);
    check("signing up adopts the waiting member record",
        ashaGroups.length === 1 && ashaGroups[0].title === "Goa Trip",
        JSON.stringify(ashaGroups.map((g) => g.title)));
    check("Asha is correctly not the owner", ashaGroups[0].isOwner === false);
    console.log(`  Asha signed up and can now see "${ashaGroups[0].title}"`);

    as(null);
    check("duplicate mobile number is rejected", (await call("POST", "/user/signup", {
        firstName: "Clone", lastName: "X", email: `clone+${stamp}@example.com`,
        password: "correct-horse-battery", mobileNo: phone(2),
    })).status === 409);
    as(yogeshToken);

    console.log("\n--- recording expenses ---");
    const spend = async (label, body) => {
        const e = await must("POST", "/expense", { groupId: G, ...body });
        const who = e.splits.map((s) => `${s.name} ${rs(s.share)}`).join(", ");
        console.log(`  ${label.padEnd(22)} ${rs(e.amount).padStart(10)}  paid by ${e.paidByName}`);
        console.log(`  ${"".padEnd(22)} split: ${who}`);
        return e;
    };

    const hotel = await spend("Hotel (3 nights)", {
        description: "Hotel", amount: 9000, paidBy: mYogesh,
    });
    check("equal split is exactly even", hotel.splits.every((s) => s.share === 3000));

    const chai = await spend("Chai (the ₹100/3 case)", {
        description: "Chai", amount: 100, paidBy: mAsha,
    });
    check("uneven split still sums to the total",
        chai.splits.reduce((n, s) => n + s.share, 0) === 100,
        JSON.stringify(chai.splits.map((s) => s.share)));
    check("payer absorbs the extra paisa",
        chai.splits.find((s) => String(s.member) === String(mAsha)).share === 33.34);

    await spend("Taxi (Ravi + Asha)", {
        description: "Taxi", amount: 600, paidBy: mRavi,
        splitType: "equal", participants: [mRavi, mAsha],
    });

    await spend("Gifts (exact shares)", {
        description: "Gifts", amount: 1000, paidBy: mYogesh, splitType: "exact",
        splits: [
            { member: mYogesh, share: 100 },
            { member: mAsha, share: 400 },
            { member: mRavi, share: 500 },
        ],
    });

    console.log("\n--- rejecting bad input ---");
    const bad = async (label, body, expected = 400) =>
        check(label, (await call("POST", "/expense",
            { groupId: G, ...body })).status === expected);
    await bad("exact splits that don't add up", {
        description: "Bad", amount: 1000, paidBy: mYogesh, splitType: "exact",
        splits: [{ member: mYogesh, share: 400 }, { member: mAsha, share: 400 }],
    });
    await bad("three decimal places", { description: "Odd", amount: 10.555, paidBy: mYogesh });
    await bad("negative amount", { description: "Neg", amount: -50, paidBy: mYogesh });
    await bad("zero amount", { description: "Zero", amount: 0, paidBy: mYogesh });
    await bad("payer outside the group",
        { description: "X", amount: 100, paidBy: "64b7f0000000000000000000" });
    await bad("participant outside the group", {
        description: "X", amount: 100, paidBy: mYogesh,
        participants: [mYogesh, "64b7f0000000000000000000"],
    });
    await bad("malformed group id", { groupId: "not-an-id", description: "X", amount: 5, paidBy: mYogesh });

    console.log("\n--- derived balances ---");
    const ledger = await call("GET", `/expense/group/${G}`);
    check("4 expenses recorded", ledger.json.data.length === 4, `got ${ledger.json.data.length}`);
    check("group total derived from the ledger",
        ledger.json.totalGroupExpenses === 10700, `got ${ledger.json.totalGroupExpenses}`);

    let bal = await must("GET", `/group/${G}/balances`);
    for (const b of bal.balances) {
        const verb = b.net > 0 ? "is owed" : b.net < 0 ? "owes    " : "square  ";
        console.log(`  ${b.name.padEnd(16)} paid ${rs(b.paid).padStart(10)}  used ${rs(b.owed).padStart(10)}  ${verb} ${rs(Math.abs(b.net))}`);
    }
    const net = Object.fromEntries(bal.balances.map((b) => [b.name, b.net]));
    check("Yogesh is owed ₹6866.67", net["Yogesh Chouhan"] === 6866.67, JSON.stringify(net));
    check("Asha owes ₹3633.34", net["Asha"] === -3633.34, JSON.stringify(net));
    check("Ravi owes ₹3233.33", net["Ravi"] === -3233.33, JSON.stringify(net));
    check("balances sum to zero",
        Math.abs(bal.balances.reduce((n, b) => n + b.net, 0)) < 0.005);

    console.log("\n--- suggested settlements ---");
    for (const t of bal.settlements) console.log(`  ${t.fromName} pays ${t.toName} ${rs(t.amount)}`);
    check("2 transfers proposed", bal.settlements.length === 2);
    check("they total the creditor's position",
        Math.abs(bal.settlements.reduce((n, t) => n + t.amount, 0) - 6866.67) < 0.005);

    console.log("\n--- settling up (POST /settlement) ---");
    check("cannot settle with yourself", (await call("POST", "/settlement", {
        groupId: G, fromMemberId: mAsha, toMemberId: mAsha,
        amount: 100,
    })).status === 400);
    check("cannot settle a negative amount", (await call("POST", "/settlement", {
        groupId: G, fromMemberId: mAsha, toMemberId: mYogesh,
        amount: -100,
    })).status === 400);
    check("outsider cannot settle", (await call("POST", "/settlement", {
        groupId: G, fromMemberId: "64b7f0000000000000000000", toMemberId: mYogesh,
        amount: 100,
    })).status === 400);

    // Partial payment first, to prove settlements don't have to clear a debt.
    const partial = await call("POST", "/settlement", {
        groupId: G, fromMemberId: mAsha, toMemberId: mYogesh, amount: 1000,
    });
    check("partial settlement accepted", partial.status === 201, JSON.stringify(partial.json));
    console.log(`  Asha pays Yogesh ${rs(1000)} (partial)`);
    check("settlement response returns updated balances", Array.isArray(partial.json.balances));
    check("Asha's debt shrank by exactly ₹1000",
        partial.json.balances.find((b) => b.name === "Asha").net === -2633.34,
        JSON.stringify(partial.json.balances.find((b) => b.name === "Asha")));

    // Now clear whatever remains.
    bal = await must("GET", `/group/${G}/balances`);
    for (const t of bal.settlements) {
        await must("POST", "/settlement", {
            groupId: G, fromMemberId: t.fromMemberId, toMemberId: t.toMemberId,
            amount: t.amount,
        });
        console.log(`  ${t.fromName} pays ${t.toName} ${rs(t.amount)}`);
    }

    const settled = await must("GET", `/group/${G}/balances`);
    console.log("");
    for (const b of settled.balances) console.log(`  ${b.name.padEnd(16)} ${rs(b.net)}`);
    check("everyone is square", settled.balances.every((b) => b.net === 0),
        JSON.stringify(settled.balances));
    check("nothing left to settle", settled.settlements.length === 0);
    check("settlements did NOT inflate group spend",
        settled.totalGroupExpenses === 10700, `got ${settled.totalGroupExpenses}`);

    const onlySettlements = await call("GET", `/expense/group/${G}?type=settlement`);
    check("settlements are filterable", onlySettlements.json.data.length === 3,
        `got ${onlySettlements.json.data.length}`);
    check("all of them are typed 'settlement'",
        onlySettlements.json.data.every((e) => e.type === "settlement"));

    console.log("\n--- referential safety ---");
    check("member in the ledger cannot be deleted",
        (await call("DELETE", `/member/${mAsha}`)).status === 409);
    const spare = (await must("POST", "/member/createMembers",
        { name: "Spare", mobileNo: phone(9), groupId: G }))._id;
    check("member with no expenses can be deleted",
        (await call("DELETE", `/member/${spare}`)).status === 200);

    console.log("\n--- deleting an expense recomputes balances ---");
    check("delete succeeds", (await call("DELETE", `/expense/${hotel._id}`)).status === 200);
    const after = await must("GET", `/group/${G}/balances`);
    check("balances moved off zero", after.balances.some((b) => b.net !== 0));
    check("and still sum to zero",
        Math.abs(after.balances.reduce((n, b) => n + b.net, 0)) < 0.005,
        JSON.stringify(after.balances));

    // Put it back so the seeded data ends in a sensible state.
    await must("POST", "/expense", {
        groupId: G, description: "Hotel", amount: 9000, paidBy: mYogesh,
    });

    console.log("\n--- a second group, owned by someone else ---");
    as(ashaToken);
    const flat = await must("POST", `/group/createGroup/${ashaUser._id}`, { title: "Flat Rent" });
    await must("POST", "/member/createMembers",
        { name: "Yogesh Chouhan", mobileNo: phone(1), groupId: flat._id });

    const flatMembers = await must("GET", `/member/getAllMembers/${flat._id}`);
    const fAsha = flatMembers.find((m) => String(m.userId) === String(ashaUser._id))._id;
    // Asha fronts the rent for both of them.
    await must("POST", "/expense", {
        groupId: flat._id, description: "Rent", amount: 20000, paidBy: fAsha,
    });
    console.log(`  "Flat Rent" — Asha paid ${rs(20000)}, split with Yogesh`);

    as(yogeshToken);
    const yGroups = await must("GET", `/group/getGroups/${yogesh._id}`);
    check("Yogesh now sees both groups", yGroups.length === 2,
        JSON.stringify(yGroups.map((g) => g.title)));
    check("he owns one and is a guest in the other",
        yGroups.filter((g) => g.isOwner).length === 1);
    check("the group list carries his net in each",
        yGroups.every((g) => typeof g.yourNet === "number"),
        JSON.stringify(yGroups.map((g) => ({ t: g.title, net: g.yourNet }))));

    console.log("\n--- cross-group summary (GET /user/:id/balances) ---");
    const summary = await must("GET", `/user/${yogesh._id}/balances`);
    console.log(`  owed to him ${rs(summary.totalYouAreOwed)} | he owes ${rs(summary.totalYouOwe)} | net ${rs(summary.net)}`);
    for (const g of summary.groups) {
        console.log(`    ${g.title.padEnd(14)} ${g.isOwner ? "owner " : "member"}  your net ${rs(g.yourNet ?? 0)}`);
    }
    for (const p of summary.people) {
        const dir = p.direction === "owes_you" ? "owes you" : "you owe ";
        console.log(`    ${dir} ${p.name.padEnd(18)} ${rs(p.amount)}  (${p.groups.join(", ")})`);
    }
    check("summary covers both groups", summary.groups.length === 2);
    check("he owes ₹10000 from the rent", summary.totalYouOwe === 10000,
        JSON.stringify(summary));
    check("net equals owed-to-him minus what he owes",
        Math.abs(summary.net - (summary.totalYouAreOwed - summary.totalYouOwe)) < 0.005);
    const ashaRow = summary.people.find((p) => p.name.startsWith("Asha"));
    check("Asha appears as a counterparty", !!ashaRow, JSON.stringify(summary.people));

    as(ashaToken);
    const ashaSummary = await must("GET", `/user/${ashaUser._id}/balances`);
    as(yogeshToken);
    check("Asha's summary is the mirror image",
        Math.abs(ashaSummary.net + summary.net) < 0.005,
        `${ashaSummary.net} vs ${summary.net}`);

    console.log("\n--- authentication & authorization ---");
    const anon = async (m, path, body) => { as(null); const r = await call(m, path, body); as(yogeshToken); return r; };
    check("no token -> 401", (await anon("GET", `/group/getGroups/${yogesh._id}`)).status === 401);
    check("no token on expenses -> 401", (await anon("GET", `/expense/group/${G}`)).status === 401);
    check("no token on balances -> 401", (await anon("GET", `/group/${G}/balances`)).status === 401);
    as("not.a.jwt");
    check("garbage token -> 401", (await call("GET", "/user/me")).status === 401);
    as(yogeshToken);
    check("valid token reaches /user/me", (await call("GET", "/user/me")).status === 200);

    // Asha is in Goa Trip but must not be able to read Yogesh's account.
    as(ashaToken);
    check("cannot read another user's summary",
        (await call("GET", `/user/${yogesh._id}/balances`)).status === 403);
    check("cannot list another user's groups",
        (await call("GET", `/group/getGroups/${yogesh._id}`)).status === 403);
    check("a member CAN read the group she belongs to",
        (await call("GET", `/group/${G}/balances`)).status === 200);
    check("only the creator may delete the group",
        (await call("DELETE", `/group/${G}`)).status === 403);

    // A complete outsider: signed up, in no groups at all.
    as(null);
    const outsider = await call("POST", "/user/signup", {
        firstName: "Mallory", lastName: "X", email: `mallory+${stamp}@example.com`,
        password: "correct-horse-battery", mobileNo: phone(7),
    });
    const outsiderToken = outsider.json.token;
    as(outsiderToken);
    check("outsider cannot read the group", (await call("GET", `/group/${G}`)).status === 403);
    check("outsider cannot list its members",
        (await call("GET", `/member/getAllMembers/${G}`)).status === 403);
    check("outsider cannot read its expenses",
        (await call("GET", `/expense/group/${G}`)).status === 403);
    check("outsider cannot add an expense to it", (await call("POST", "/expense", {
        groupId: G, description: "Sneaky", amount: 500, paidBy: mYogesh,
    })).status === 403);
    check("outsider cannot add a member to it", (await call("POST", "/member/createMembers", {
        name: "Ghost", mobileNo: phone(8), groupId: G,
    })).status === 403);
    check("outsider cannot record a settlement", (await call("POST", "/settlement", {
        groupId: G, fromMemberId: mAsha, toMemberId: mYogesh, amount: 10,
    })).status === 403);
    check("outsider's own summary is empty, not an error",
        (await call("GET", "/user/me/balances")).json.data.groups.length === 0);

    as(yogeshToken);
    const forged = await call("POST", "/expense", {
        groupId: G, description: "Who recorded this?", amount: 10, paidBy: mYogesh,
        createdBy: outsider.json.data._id,   // ignored on purpose
    });
    check("createdBy in the body is ignored, token wins",
        String(forged.json.data.createdBy) === String(yogesh._id),
        `recorded as ${forged.json.data.createdBy}`);
    await call("DELETE", `/expense/${forged.json.data._id}`);

    console.log("\n--- retired endpoints ---");
    check("the old stored-balance endpoint is gone",
        (await call("PATCH", `/member/updateMember/${G}`, [])).status === 404);

    console.log(`\n${"=".repeat(46)}`);
    console.log(`  ${pass} passed, ${fail} failed`);
    console.log(`${"=".repeat(46)}`);

    if (fail > 0) {
        console.log(`\n--- ${appErrors.length} server-side error(s) logged ---`);
        appErrors.forEach((a) => realError(...a));
    }
    if (!KEEP) {
        console.log(`\nSeeded group "${group.title}" (${G}) with 3 members,`);
        console.log(`4 expenses and 3 settlements. Log in as`);
        console.log(`  yogesh+${stamp}@example.com / correct-horse-battery\n`);
    }

    await mongoose.connection.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch(async (err) => {
    console.error("\nSEED FAILED:", err.message);
    try { await mongoose.connection.close(); } catch (_) {}
    process.exit(1);
});
