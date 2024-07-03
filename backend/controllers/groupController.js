const Group = require('../models/groupModel');
const User = require('../models/userModel');
const Member = require('../models/membersModel');

exports.createGroup = async (req, res) => {
    try{
        let id = req.params.id;
        let user = await User.findById(id)
        let newGroup = await Group.create(req.body);

        let name = user?.firstName + " " + user?.lastName;
        let newMember = await Member.create({name, mobileNo: user?.mobileNo, expense: 0, paymentHistory: [], groupId: newGroup?._id});
        

        res.status(201).json({
            status: true,
            data: newGroup
        });
    }catch(err){
        res.status(500).json({
            status: false,
            message: 'Internal Server Error'
        });
    }
}

exports.editGroupName = async (req, res) => {
    try{
        const id = req.params.id;

        const updateGroupName = await Group.findByIdAndUpdate(id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: updateGroupName
        })
    }catch(err){
        res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        })
    }
}