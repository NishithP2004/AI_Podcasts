const express = require("express");

const { generatePodcast } = require("./utils")
const app = express();

app.use(express.json())
app.use(express.urlencoded({
    extended: true
}))

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Listening on port: ${PORT}`)
})

app.post("/podcast", async (req, res) => {
    try {
        const topic = req.body.topic;
        const actors = req.body.actors;

        console.log(`Topic: ${topic} `)
        console.log(`Actors: ${JSON.stringify(actors)}`)
        if (!topic || !actors.length === 2) {
            res.status(400).json({
                success: false,
                error: "Required parameters not provided"
            })
        } else {
            const script = await generatePodcast(topic, actors);

            res.status(200).send(script)
        }
    } catch (err) {
        res.status(500).send({
            success: false,
            error: err.message
        })
    }
});