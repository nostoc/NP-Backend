
const { Worker } = require('worker_threads');

const Quiz = require("../models/Quiz");
const {join} = require("node:path");






const Create = async (req, res) => {
    try {
        const { title, userId } = req.body;
        const newQuiz = new Quiz({ title, userId });
        await newQuiz.save();
        res.status(201).json({ message: "Quiz created successfully", quiz: newQuiz });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

const getUsersQuizes = async (req, res) => {
    try {
        id = req.params.userId;
        const quizzes = await Quiz.find({userId: id}).exec();
        res.status(200).json(quizzes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

const deleteQuiz = async (req, res) => {
    try {
        await Quiz.findByIdAndDelete(req.params.quizId);
        res.status(200).json({ message: "Quiz deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}


const setLive = async (req, res, io, rooms) => {
    try {
        const { quizId } = req.params;
        const quiz = await Quiz.findById(quizId);
        if (!quiz) return res.status(404).json({ message: "Quiz not found" });

        quiz.isLive = true;
        await quiz.save();

        let roomId = null;
        let worker = null;
        const roomWorkers = req.app.get("roomWorkers");

        // Check if there's an available worker thread
        for (const [existingRoomId, existingWorker] of roomWorkers.entries()) {
            if (!rooms.has(existingRoomId)) { // Unused worker found
                roomId = existingRoomId;
                worker = existingWorker;
                break;
            }
        }

        if (!worker) {
            // If no existing worker, create a new worker thread
            roomId = Math.floor(1000 + Math.random() * 9000).toString();
            worker = new Worker(join(__dirname, "../models/roomWorker.js"), {
                workerData: { roomId },
            });

            worker.on("message", (msg) => {
                if (msg.type === "THREAD_STARTED") {
                    io.to(roomId).emit("room-details", {
                        quizId,
                        threadId: msg.threadId,
                        hostId: quiz.userId,
                    });
                }
            });

            roomWorkers.set(roomId, worker);
        } else {
            // If reusing an existing worker, reset it
            worker.postMessage({ type: "RESET" });
            console.log(`♻️ Reusing Worker Thread ${worker.threadId} for Room ${roomId}`);
        }

        // Assign the room
        rooms.set(roomId, {
            quizId,
            participants: [],
            hostId: quiz.userId,
            currentQuestionIndex: -1,
            questions: [],
            roundScores: [], // Stores scores for each round
            leaderboard: new Map(), // Track cumulative scores
            questionStartTime: null,
            questionTimer: null
        });

        io.emit("room-created", { roomId, quizId });

        res.json({ roomId });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
};



const setNotLive = async (req, res, io, rooms) => {
    try {
        const { quizId } = req.params;
        const quiz = await Quiz.findById(quizId);
        if (!quiz) return res.status(404).json({ message: "Quiz not found" });

        let roomIdToDelete = null;
        for (const [roomId, roomData] of rooms.entries()) {
            if (roomData.quizId === quizId) {
                roomIdToDelete = roomId;
                break;
            }
        }

        if (!roomIdToDelete) {
            return res.status(404).json({ message: "No active room found" });
        }

        const worker = req.app.get("roomWorkers").get(roomIdToDelete);
        if (worker) {
            worker.postMessage({ type: "RESET" });
            console.log(`♻️ Worker thread ${worker.threadId} has been reset.`);
        } else {
            console.log(`⚠️ No worker thread found for room ${roomIdToDelete}.`);
        }

        rooms.delete(roomIdToDelete);
        quiz.isLive = false;
        await quiz.save();

        io.emit("quiz-ended", { roomId: roomIdToDelete });

        res.json({ message: "Quiz stopped", roomId: roomIdToDelete });
    } catch (error) {
        console.error("❌ Error stopping quiz:", error);
        res.status(500).json({ message: "Server error", error });
    }
};





module.exports = { Create ,getUsersQuizes, deleteQuiz, setLive, setNotLive};
