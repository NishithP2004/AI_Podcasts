const {
    ChatGoogleGenerativeAI,
    GoogleGenerativeAIEmbeddings
} = require("@langchain/google-genai");
const {
    WebBrowser
} = require("langchain/tools/webbrowser");
const {
    initializeAgentExecutorWithOptions
} = require("langchain/agents");
require("dotenv").config();

const model = new ChatGoogleGenerativeAI({
    modelName: "gemini-pro",
    maxOutputTokens: 2048,
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.7
});

const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    modelName: "gemini-pro"
});

var tools = [new WebBrowser({
    model,
    embeddings
})];

async function getCharacterBackground(characterName) {
    try {
        const executor = await initializeAgentExecutorWithOptions(tools, model, {
            agentType: "zero-shot-react-description",
            verbose: false,
        });
        const input = `Give a concise character sketch on ${characterName}. Be as descriptive as possible and include all the necessary details that can be used to distinguish the said character as an individual.`;
        const result = await executor.invoke({
            input
        });

        // console.log(`Got output ${JSON.stringify(result, null, 2)}`);

        return result.output;
    } catch (err) {
        console.error(err);
        return null;
    }
}

async function generateCharacterSketch(characterName) {
    try {
        let background = await getCharacterBackground(characterName);
        console.log("Background: " + background);

        let AI_Prompt = `
        SYSTEM: You are an intelligent character analyser.
                Given information or background on a character, be it an actor, novelist or a fictional character, you can intelligently summarise the key attributes into a concise character sketch which can be used to train an LLM to adapt the persona of the said character. Be as descriptive and specific as possible.
                Return the result as plain text.
        CHARACTER_NAME: ${characterName}
        CHARACTER_BACKGROUND: ${background}
      `;

        let sketch = (await model.invoke([
            ["human", AI_Prompt]
        ])).content;

        return sketch;
    } catch (err) {
        if (err) {
            console.error(err);
            return null;
        }
    }
}

module.exports = {
    generateCharacterSketch
}