require("dotenv").config();
const express = require("express");

const {
    generatePodcast
} = require("./utils")
const app = express();
const twilio = require("./twilio-integration/twilio")

app.use(express.json())
app.use(express.urlencoded({
    extended: true
}))

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Listening on port: ${PORT}`)
})

app.use("/twilio", twilio)

app.get("/", (req, res) => {
    res.send({
        message: "Hello World"
    })
})

app.post("/podcasts/generate", async (req, res) => {
    try {
        const topic = req.body.topic;
        const characters = req.body.characters;
        const q = req.query.q;
        const history = req.body.history;
        const user = req.body.user;

        console.log(`Topic: ${topic} `)
        console.log(`Characters: ${JSON.stringify(characters)}`)

        if (!topic || !characters || characters.length !== 2) {
            return res.status(400).json({
                success: false,
                error: "Required parameters not provided"
            });
        }

        if (q && (!history || history.length === 0)) {
            return res.status(400).json({
                success: false,
                error: "Required parameters not provided"
            });
        }

        const script = await generatePodcast(topic, characters, {
            q,
            history: history?.map(s => {
                delete s.audio;
                return s;
            })
        }, user);

        res.status(200).send(script);
    } catch (err) {
        res.status(500).send({
            success: false,
            error: err.message
        })
    }
});