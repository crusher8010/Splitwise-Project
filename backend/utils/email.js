const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const sendEmail = ({ to, subject, text }) =>
    transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        text,
    });

module.exports = { sendEmail };
