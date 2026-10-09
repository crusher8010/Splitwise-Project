const express = require("express");
const {
    createGroup,
    getGroups,
    getGroup,
    editGroupName,
    deleteGroup,
} = require("../controllers/groupController");
const { getGroupBalances } = require("../controllers/balanceController");
const {
    protect,
    requireSelf,
    requireGroupAccess,
    requireGroupOwner,
} = require("../middleware/auth");

const router = express.Router();

router.use(protect);

// Preferred forms — the caller is taken from the token.
router.route("/").post(createGroup).get(getGroups);

// Legacy forms that carry the user id in the path; it must be the caller's.
router.route("/createGroup/:id").post(requireSelf(), createGroup);
router.route("/getGroups/:id").get(requireSelf(), getGroups);

// Group-scoped: you must belong to the group.
const inGroup = requireGroupAccess([["params", "id"]]);

router.route("/:id/balances").get(inGroup, getGroupBalances);
router.route("/patchGroup/:id").patch(inGroup, editGroupName);
router
    .route("/:id")
    .get(inGroup, getGroup)
    .patch(inGroup, editGroupName)
    // Deleting takes the members and the whole ledger with it, so it stays
    // with whoever created the group.
    .delete(inGroup, requireGroupOwner, deleteGroup);

module.exports = router;
