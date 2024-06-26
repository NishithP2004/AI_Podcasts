const {
    formatDocumentsAsString
} = require("langchain/util/document");
const {
    AzureCosmosDBVectorStore
} = require("@langchain/community/vectorstores/azure_cosmosdb");
const {
    MongoClient
} = require("mongodb");

require("dotenv").config();

const client = new MongoClient(process.env.MONGO_CONNECTION_URL);
const namespace = process.env.MONGO_NAMESPACE;
const [dbName, collectionName] = namespace.split(".");

(async function () {
    await client.connect();
    console.log("Connected successfully to Cosmos DB");
})();

// -- Models --
const {
    AzureOpenAIEmbeddings
} = require("@langchain/openai");

const embeddings = new AzureOpenAIEmbeddings({
    azureOpenAIApiKey: process.env.AZURE_OPENAI_STUDIO_API_KEY,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_STUDIO_API_VERSION,
    azureOpenAIApiEmbeddingsDeploymentName: "text-embedding-ada-002",
    endpoint: process.env.AZURE_OPENAI_STUDIO_API_ENDPOINT,
    model: "text-embedding-ada-002",
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_STUDIO_API_INSTANCE_NAME
})
// -- Models --

const db = client.db(dbName);
const collection = db.collection(collectionName);
const vectorstore = new AzureCosmosDBVectorStore(embeddings, {
    collection,
    indexName: "vectorSearchIndex",
    client,
    connectionString: process.env.MONGO_CONNECTION_URL,
    databaseName: dbName,
    embeddingKey: "embedding",
    textKey: "text",
    collectionName,
    indexOptions: {
        skipCreate: true
    }
});

async function retrieveSimilarDocs(query, user, course) {
    let docs = await vectorstore.similaritySearchWithScore(query, 5)
    return docs.map(doc => {
        return {
            content: doc[0].pageContent,
            user: doc[0].metadata.user,
            course: doc[0].metadata.course,
            score: doc[1]
        }
    }).filter((d) =>
        !course ?
        d.user === user :
        d.user == user && d.course === course
    );
}

function serializeDocs(docs) {
    return (docs && docs.length > 0) ? docs.map(doc => {
        return doc.content
    }).join("\n") : "";
}

module.exports = {
    retrieveSimilarDocs,
    serializeDocs
};