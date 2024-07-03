const mongoose = require("mongoose");

const paymentHistorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    amount:{
        type: Number,
        required: true,
    }
})

const memberSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    mobileNo: {
        type: String,
        required: true
    },
    expenses: {
        type: Number,
        required: true
    },
    paymentHistory: {
        type: [],
        required: true
    },
    groupId: {
        type: String,
        required: true
    }
});

const Members = mongoose.model('members', memberSchema);
module.exports = Members; 