const sdk = require("microsoft-cognitiveservices-speech-sdk");
const crypto = require("node:crypto");

async function synthesizeSpeech(text, voice) {
    const audioFile = `audio/${crypto.randomBytes(4).toString("hex")}.mp3`
    const speechConfig = sdk.SpeechConfig.fromSubscription(process.env.SPEECH_KEY, process.env.SPEECH_REGION)
    const audioConfig = sdk.AudioConfig.fromAudioFileOutput(audioFile)

    speechConfig.speechSynthesisVoiceName = voice || "en-us-AvaMultilingualNeural"

    var synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

    return new Promise((resolve, reject) => {
        synthesizer.speakTextAsync(text, (result) => {
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                console.log("Synthesis Completed");
                resolve(audioFile);
            } else {
                console.error("Speech synthesis canceled, " + result.errorDetails);
                reject(new Error(result.errorDetails));
            }
            synthesizer.close();
        }, (err) => {
            console.trace(err);
            synthesizer.close();
            reject(err);
        });
    });
}

module.exports = {
    synthesizeSpeech
}