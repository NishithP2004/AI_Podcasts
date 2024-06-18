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
const { uploadImage } = require("./imgur")

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

async function generateScript(topic, actors) {
    try {
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

async function generatePodcast(topic, actors) {
    try {
        console.log("Generating Script...")
        let script = JSON.parse(await generateScript(topic, actors));
        console.log("Script Generated")
        console.log(script)

        console.log(`Generating Thumbnail: ${script.thumbnail.prompt}`)
        const dalleUrl = (await generateImage(script.thumbnail.prompt)).data[0].url
        script.thumbnail.url = await uploadImage(dalleUrl);
        console.log(`Image Generated: ${script.thumbnail.url}`)

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

module.exports = {
    generatePodcast
}