const express = require("express");
const { createSettlement, deleteExpense } = require("../controllers/expenseController");
const {
    protect,
    requireGroupAccess,
    requireExpenseAccess,
} = require("../middleware/auth");

const router = express.Router();

router.use(protect);

router.route("/").post(requireGroupAccess([["body", "groupId"]]), createSettlement);

// Settlements live in the expense collection, so removing one is the same
// operation — and the same access check — as removing an expense.
router.route("/:id").delete(requireExpenseAccess, deleteExpense);

module.exports = router;
