const Members = require('../models/membersModel');

exports.createMember = async(req, res) => {
    try{
        const newMember = await Members.create(req.body);

        res.status(200).json({
            success: true,
            data: newMember
        });

    }catch(err){
        res.status(500).json({
            success: false,
            message: 'Internal Server Error!'
        })
    }
}

exports.updateMember = async(req, res) => {
    try{
        let id = req.params.id;


        let temp = req.body;
        let allMember = await Members.find();

        let paymentData = temp.reduce((arr, item) => {
            arr[item.id] = item;
            return arr;
        }, {});

        const updatePromises = allMember.map((member) => {
            const update = paymentData[member._id];
            return Members.updateOne(
                {_id: member._id},
                {
                    $set: {
                        expenses: update.expenses,
                        paymentHistory: update.paymentHistory
                    }
                }
            )
        });

        const results = await Promise.all(updatePromises);

        res.status(200).json({
            message: 'success',
            data: results
        });
    }catch(err){
        res.status(500).json({
            status: false,
            message: 'Invalid Parameters!'
        })
    }
}

exports.getAllMembers = async(req, res) => {
    try{
        let id = req.params.id;

        let allMember = await Members.find();

        let filteredMembers = allMember.filter((el) => el.groupId === id);

        res.status(200).json({
            status: true,
            data: filteredMembers
        })
    }catch(err){
        res.status(500).json({
            status: false,
            message: 'Invalid Parameters!'
        })
    }
}