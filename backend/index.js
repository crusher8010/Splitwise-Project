const express = require("express");
const dotenv = require("dotenv");
const cors = require('cors');
const mongoose = require('mongoose');

const groupRoute = require('./routes/groupRoutes');
const memberRoute = require('./routes/memberRoutes');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({
    origin: "*"
}));

app.use('/group', groupRoute);
app.use('/member', memberRoute);

let url = process.env.MONGO_URL;
mongoose.connect(url).then(() => console.log('Successfully connected database')).catch((err) => console.log(err));

const port = process.env.PORT || 8000;

app.listen(port, () => {
    console.log(`Port is running on ${port}`)
});