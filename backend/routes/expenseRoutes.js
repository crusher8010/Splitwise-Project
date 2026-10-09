const express = require("express");
const {
    createExpense,
    getGroupExpenses,
    getMyExpenses,
    getExpense,
    deleteExpense,
} = require("../controllers/expenseController");
const {
    protect,
    requireGroupAccess,
    requireExpenseAccess,
} = require("../middleware/auth");

const router = express.Router();

router.use(protect);

router.route("/").post(requireGroupAccess([["body", "groupId"]]), createExpense);

// :id is the GROUP here.
router
    .route("/group/:id")
    .get(requireGroupAccess([["params", "id"]]), getGroupExpenses);

// Every entry the caller is part of, across all their groups, by month.
// Registered before "/:id" — otherwise Express reads "mine" as an expense id.
router.route("/mine").get(getMyExpenses);

// :id is the EXPENSE — the group is resolved from the expense itself.
router
    .route("/:id")
    .get(requireExpenseAccess, getExpense)
    .delete(requireExpenseAccess, deleteExpense);

module.exports = router;
