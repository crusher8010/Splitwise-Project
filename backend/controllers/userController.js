const User = require('../models/userModel');
const bycrpt = require('bcrypt');
const jwt = require('jsonwebtoken');
const key = process.env.key;

exports.createUser = async(req, res) => {
    try{
        const {firstName, lastName, email, password} = req.body;

        bycrpt.hash(password, 5, async (err, spassword) => {
            if(err){
                return res.status(400).json({
                    status: false,
                    message: "Something went wrong!"
                })
            }else{
                const newUser = await User.create({fullName, lastName, email, password: spassword});

                res.status(200).json({
                    status: true,
                    data: newUser
                })
            }
        })

    }catch(err){
        res.status(500).json({
            status: false,
            message: "Internal server error!"
        })
    }
}


exports.checkUser = async(req, res) => {
    try{
        const {email, password} = req.body;
        let getUser = await User.find({email});

        if(getUser.length > 0){
            let userDetails = getUser[0];
            bycrpt.compare(password, getUser[0].password, (err, result) => {
                if(result){
                    jwt.sign({userDetails}, key, {expiresIn: '1h'}, (err, token) => {
                        res.status(200).json({
                            status: true,
                            data: userDetails,
                            token
                        })
                    })
                }else{
                    res.status(400).json({
                        status: false,
                        message: "Invalid Crenditials!"
                    })
                }
            })
        }

    }catch(err){
        res.status(400).json({
            status: false,
            message: "Something went wrong!"
        })
    }
}