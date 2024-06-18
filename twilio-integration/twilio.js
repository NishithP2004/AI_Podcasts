require("dotenv").config();

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require("twilio")(accountSid, authToken);

const express = require("express");
const app = express();

app.use(express.json())
app.use(express.urlencoded({
    extended: true
}))

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Listening on port: ${PORT}`)
})

(async function() {
    let details = await client.balance.fetch();
    console.log("Account sid: %s\nBalance: %f %s", details.accountSid, details.balance, details.currency)
})();

app.get("/api/greeting", (req, res) => {
    
})