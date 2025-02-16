const { parentPort, workerData, threadId } = require("worker_threads");

const { roomId } = workerData;

console.log(`🧵 Worker Thread ${threadId} started for Room ${roomId}`);

parentPort.postMessage({ type: "THREAD_STARTED", threadId, roomId });

let participants = [];

parentPort.on("message", (message) => {
    switch (message.type) {
        case "ADD_PARTICIPANT":
            participants.push(message.data);
            break;
        case "REMOVE_PARTICIPANT":
            participants = participants.filter(p => p.id !== message.data.id);
            break;
        case "RESET":
            console.log(`♻️ Resetting Worker Thread ${threadId} for a new quiz`);
            participants = [];
            break;
        case "CLOSE":
            console.log(`🛑 Closing Room ${roomId}`);
            parentPort.close();
            break;
    }
});
