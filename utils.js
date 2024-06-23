const fs = require("node:fs");
require("dotenv").config();
const {
    AzureOpenAI
} = require("openai")
const {
    synthesizeSpeech
} = require("./speechSynthesis")
const {
    generateCharacterSketch
} = require("./ai_persona");
const {
    uploadImage
} = require("./imgur")
const {
    retrieveSimilarDocs,
    serializeDocs
} = require("./retriever")
const {
    MongoClient
} = require("mongodb");
const crypto = require("node:crypto")

const model = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    endpoint: process.env.AZURE_OPENAI_API_ENDPOINT
})

const studioModel = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_STUDIO_API_KEY,
    apiVersion: process.env.AZURE_OPENAI_STUDIO_API_VERSION,
    deployment: "dall-e-3",
    endpoint: process.env.AZURE_OPENAI_STUDIO_API_ENDPOINT
})

async function generateScript(topic, actors, followUp, user) {
    try {
        let context = "";
        let docs = await retrieveSimilarDocs(followUp.q || topic, user.uid)
        let serialized = serializeDocs(docs)
        console.log("Retrieved Documents: " + serialized)

        const characters = [{
                id: 1,
                name: actors[0].name,
                sketch: await generateCharacterSketch(actors[0].name)
            },
            {
                id: 2,
                name: actors[1].name,
                sketch: await generateCharacterSketch(actors[1].name)
            }
        ]

        if (followUp.q)
            context = `\nHISTORY: ${JSON.stringify(followUp.history)}\n\n USER'S NAME: ${user.name} \nUSER'S QUERY: ${followUp.q} `

        const response = await model.chat.completions.create({
            model: "gpt-4-32k",
            messages: [{
                    "role": "system",
                    "content": fs.readFileSync("./script.prompt", 'utf-8')
                },
                {
                    "role": "user",
                    "content": `TOPIC: ${topic}

                                ACTOR PERSONAS:
                                ${JSON.stringify(characters)}
                    `
                },
                {
                    "role": "user",
                    "content": `REFERENCES:
                                ${serialized}

                                ${(followUp.q)? context: ""}
                    `
                }
            ],
            temperature: 0.7,
            response_format: {
                type: "json_object"
            }
        })

        return response.choices[0].message.content;
    } catch (err) {
        console.error("Error generating script.")
        throw err;
    }
};

async function generateImage(prompt) {
    try {
        const image = await studioModel.images.generate({
            prompt: prompt,
            model: "dall-e-3",
            quality: "standard",
            size: "1024x1024",
            response_format: "url",
            n: 1
        })

        return image;
    } catch (err) {
        console.error("Error generating image.")
        throw err;
    }
}

async function generateSummary(transcript) {
    try {
        const prompt = `
        Generate a detailed and polished summary for the provided podcast transcript. 
        Format the summary as if it were a WhatsApp message.
        `

        const response = await model.chat.completions.create({
            messages: [{
                    "role": "system",
                    "content": prompt
                },
                {
                    "role": "user",
                    "content": transcript
                }
            ],
            model: "gpt-4-32k",
            temperature: 0.7,
            response_format: {
                type: "text"
            }
        })

        return response.choices[0].message.content;
    } catch (err) {
        console.error("Error generating summary for the provided transcript.")
    }
}

async function generatePodcast(topic, actors, followUp, user) {
    try {
        console.log("Generating Script...")
        let script = JSON.parse(await generateScript(topic, actors, followUp, user));
        console.log("Script Generated")
        console.log(script)

        if (!followUp.q) {
            console.log(`Generating Thumbnail: ${script.thumbnail.prompt}`)
            const dalleUrl = (await generateImage(script.thumbnail.prompt)).data[0].url
            script.thumbnail.url = await uploadImage(dalleUrl);
            console.log(`Image Generated: ${script.thumbnail.url}`)
        }

        let audioFiles = [];

        for (let dialog of script.script) {
            try {
                /* if (dialog.actor == "0") {
                    console.log(`Generating Image: ${dialog.prompt}`)
                    dialog.url = (await generateImage(dialog.prompt)).data[0].url;
                    console.log(`Image Generated: ${dialog.url}`)
                } */

                if (dialog.actor == "1" || dialog.actor == "2") {
                    console.log(`Generating Audio: ${dialog.dialog}`);
                    const audioFile = await synthesizeSpeech(dialog.dialog, actors[parseInt(dialog.actor) - 1].voice)
                    audioFiles.push(audioFile)
                    const audio = (await fs.promises.readFile(audioFile)).toString("base64")
                    dialog.audio = audio;
                    console.log(`Audio Generated`)
                }
            } catch (err) {
                console.error(err.message)
                continue;
            }
        }
        script["characters"] = actors;
        console.log("Cleaning Up...")
        await Promise.all(audioFiles.map((file) => {
            fs.promises.unlink(file)
        }))
        return script;
    } catch (err) {
        console.error("Error generating podcast.");
        throw err;
    }
}

async function savePodcast(podcast, user) {
    const client = new MongoClient(process.env.MONGO_CONNECTION_URL);
    const namespace = process.env.MONGO_NAMESPACE;
    const [dbName, ] = namespace.split(".");
    await client.connect();
    console.log("Connected successfully to Cosmos DB");
    const db = client.db(dbName);
    const collection = db.collection("podcasts");
    const session = client.startSession();

    try {
        session.startTransaction()
        podcast.id = crypto.randomBytes(4).toString("hex");

        await collection.insertOne(podcast, {
            session
        })

        await session.commitTransaction();
    } catch (err) {
        console.error(err.message)
        await session.abortTransaction();
    } finally {
        await session.endSession();
        await client.close();
    }
}

module.exports = {
    generatePodcast,
    generateSummary,
    savePodcast
}