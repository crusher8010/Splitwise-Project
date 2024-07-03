const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    totalGroupExpenses: {
        type: Number,
        required: true
    },
    userId: {
        type: String,
        required: true
    }
});

const splitGroup = mongoose.model('groups', groupSchema);
module.exports = splitGroup;