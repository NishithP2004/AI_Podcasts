require("dotenv").config();
const { ImgurClient } = require('imgur');

const client = new ImgurClient({
    clientId: process.env.IMGUR_CLIENT_ID,
    clientSecret: process.env.IMGUR_CLIENT_SECRET
})

async function uploadImage(image) {
    try {
        const response = await client.upload({
            image
        })
        return response.data.link;
    } catch(err) {
        console.error("Error uploading image to Imgur.")
        throw err;
    }
}

module.exports = {
    uploadImage
}