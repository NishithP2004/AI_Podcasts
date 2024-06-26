require("dotenv").config({
    path: "../.env"
});
const morgan = require("morgan")
const fs = require("node:fs")
const puppeteer = require("puppeteer")

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require("twilio")(accountSid, authToken);
const VoiceResponse = require("twilio").twiml.VoiceResponse;

const {
    generatePodcast,
    generateSummary,
    savePodcast
} = require("../utils")
const {
    redis
} = require("./cache");

const express = require("express");
const app = express.Router();
const ejs = require("ejs");

app.use(express.json())
app.use(express.urlencoded({
    extended: true
}))
app.use(morgan(":method :url :status - :remote-addr"));

(async function () {
    let details = await client.balance.fetch();
    console.log("Account sid: %s\nBalance: %f %s", details.accountSid, details.balance, details.currency)
})();

app.post("/call", async (req, res) => {
    try {
        const ph = req.body.ph;
        const call = await client.calls.create({
            to: ph,
            from: process.env.TWILIO_PHONE_NUMBER,
            sendDigits: "w",
            url: `${process.env.HOST_URL}/twilio/greeting`,
            statusCallback: `${process.env.HOST_URL}/twilio/status`,
            statusCallbackMethod: "POST",
            statusCallbackEvent: ["initiated", "answered", "completed"]
        })

        console.log("Call Initiated: %s", call.sid);

        res.status(201).send({
            success: true,
            sid: call.sid
        })
    } catch (err) {
        res.status(500).send({
            error: err.message,
            success: false
        })
    }
})

app.post("/greeting", (req, res) => {
    console.log(req.body)
    const twiml = new VoiceResponse();

    twiml
        .gather({
            action: "/twilio/init",
            input: "dtmf",
            method: "POST",
            numDigits: 1
        })
        .say({
            voice: "alice"
        }, "Welcome to A.I. Podcasts by Project X ! Please press 1 to start the discussion.")

    res.type("text/xml")

    res.send(twiml.toString());
})

app.post("/init", (req, res) => {
    console.log(req.body)
    const digit = req.body.Digits;
    const twiml = new VoiceResponse();
    if (digit[0] == '1') {
        twiml.redirect({
            method: "POST"
        }, "/twilio/podcast?action=init")
    } else {
        twiml.hangup()
    }
    console.log(req.body)

    res.type("text/xml")
    res.send(twiml.toString())
})

app.post("/podcast", async (req, res) => {
    const action = req.query.action;
    const ph = req.body.To;
    const CallSid = req.body.CallSid;
    let podcast, xmlScript;

    res.type("text/xml");
    const twiml = new VoiceResponse();
    twiml.play(`${process.env.HOST_URL}/twilio/bgm.mp3`)
    res.send(twiml.toString())

    if (action === "init") {
        podcast = await redis.json.get(`podcast:user:${ph}`)
    } else if (action === "generate") {
        const input = req.body.SpeechResult;
        console.log("Speech Result: " + input)

        podcast = await redis.json.get(`podcast:user:${ph}`);
        let index = parseInt(req.query.index);
        podcast.history = [
            ...podcast.script.slice(0, index + 1),
            {
                "actor": "3", // 3 signifies the user
                "dialog": input
            },
            ...podcast.history
        ]

        const generated = await generatePodcast(podcast.title, podcast.characters, {
            q: input,
            history: podcast.script.slice(0, index + 1)
        }, podcast.user)

        podcast.script = generated.script;
        await redis.json.set(`podcast:user:${ph}`, "$", podcast, {
            EX: 3600
        })
    }

    xmlScript = await convertScriptToXML(podcast.script || []);
    await updateCallContext(CallSid, xmlScript)
    // res.send(xmlScript);
})

app.post("/status", async (req, res) => {
    try {
        console.log(req.body)
        const ph = req.body.To;
        const status = req.body.CallStatus;
        let msg = "Hello";

        switch (status) {
            case "completed":
                msg = "Thanks for using Project X !"
                break;
            case "initiated":
                msg = "Call initiated"
                break;
            case "answered":
                msg = "Call answered"
                break;
        }

        await client.messages.create({
                body: msg,
                from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER_WA}`,
                to: `whatsapp:${ph}`
            })
            .then(message => console.log(message.sid))

        if (status === "completed") {
            let podcast = await redis.json.get(`podcast:user:${ph}`);
            let transcript = convertScriptToTranscript(podcast.history, podcast.characters, podcast.user)
            let summary = await generateSummary(transcript);
            console.log("Summary: " + summary)
            let transcriptUrl = await convertToPdf(podcast)
            console.log("Transcript URL: " + transcriptUrl)

            await client.messages.create({
                    body: summary,
                    mediaUrl: [transcriptUrl],
                    from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER_WA}`,
                    to: `whatsapp:${ph}`
                })
                .then(message => console.log(message.sid))

            podcast.script = podcast.history;
            delete podcast.history;
            delete podcast.user;
            await savePodcast(podcast)
            await redis.json.del(`podcast:user:${ph}`, "$")
        }
    } catch (err) {
        console.error(err.message)
    }
})

app.get("/bgm.mp3", (req, res) => {
    res.sendFile(__dirname + "/bgm.mp3")
})

async function updateCallContext(CallSid, xmlScript) {
    return client.calls.get(CallSid).update({
            twiml: xmlScript
        })
        .then(call => console.log(`Call updated with new script: ${call.sid}`))
        .catch(error => console.error(error));
}

async function convertScriptToXML(script) {
    const twiml = new VoiceResponse();

    for (let dialog of script) {
        let audio = await uploadFile(dialog.audio)
        twiml
            .gather({
                input: "speech",
                method: "POST",
                action: `/twilio/podcast?action=generate&index=${script.indexOf(dialog)}`,
                timeout: 2
            })
            .play(audio)
    }
    twiml.hangup();

    return twiml.toString();
}

function convertScriptToTranscript(script, actors, user) {
    let transcript = "";

    for (let dialog of script) {
        if (dialog.id != 3) {
            let index = actors.find((actor) => actor.id == dialog.actor);
            transcript += `${actors[index].name}: ${dialog.dialog}\n\n`
        } else {
            transcript += `${user.name}: ${dialog.dialog}\n\n`
        }
    }

    return transcript;
}

// Temporary file store
async function uploadFile(base64Data, filename = "audio.mp3") {
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer])

    const formData = new FormData();
    formData.append('file', blob, filename);

    try {
        const response = await fetch("https://tmpfiles.org/api/v1/upload", {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        let t = data.data.url;
        // const url = t.slice(0, t.indexOf("/", t.indexOf(".org"))) + "/dl/" + t.slice(t.indexOf("/", t.indexOf(".org")) + 1)
        const url = `${new URL(t).protocol}//${new URL(t).hostname}/dl${new URL(t).pathname}`
        return url;
    } catch (error) {
        console.error('Error uploading file:', error.message);
    }
}

async function convertToPdf(podcast) {
    let ejs_template = fs.readFileSync(__dirname + "/views/transcript.ejs", 'utf-8');
    let html = ejs.render(ejs_template, {
        podcast
    });

    const browser = await puppeteer.launch({
        headless: "new"
    });
    const page = await browser.newPage();
    await page.setContent(html, {
        waitUntil: "load"
    });
    let pdf = await page.pdf({
        format: "A4"
    });

    await browser.close();

    let fileUrl = await uploadFile(new Buffer(pdf).toString("base64"), "transcript.pdf")
    return fileUrl;
}

module.exports = app;