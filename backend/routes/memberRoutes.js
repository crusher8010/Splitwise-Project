const express = require("express");
const {
    getAllMembers,
    createMember,
    editMember,
    deleteMember,
} = require("../controllers/memberController");
const {
    protect,
    requireGroupAccess,
    requireMemberAccess,
} = require("../middleware/auth");

const router = express.Router();

router.use(protect);

// :id here is the GROUP.
router
    .route("/getAllMembers/:id")
    .get(requireGroupAccess([["params", "id"]]), getAllMembers);

// The group comes from the body on create.
router
    .route("/createMembers")
    .post(requireGroupAccess([["body", "groupId"]]), createMember);

// :id here is the MEMBER — the group is resolved from the member record.
router
    .route("/:id")
    .patch(requireMemberAccess, editMember)
    .delete(requireMemberAccess, deleteMember);

module.exports = router;
