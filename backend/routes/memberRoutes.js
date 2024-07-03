const express = require('express');

const {getAllMembers, createMember, updateMember} = require('../controllers/memberController');

const router = express.Router();

router.route('/getAllMembers/:id').get(getAllMembers);
router.route('/createMembers').post(createMember);
router.route('/updateMember/:id').patch(updateMember);

module.exports = router;