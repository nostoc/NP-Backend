const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const http = require('http');
const Question = require('./models/Question.js');

const UserRouter = require('./routes/UserRoutes.js');
const QuizRouter = require('./routes/QuizRoutes.js');
const QuestionRouter = require('./routes/QuestionRoutes.js');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        credentials: true
    }
});

app.set("io", io);

const PORT = process.env.PORT || 4001;

// CORS configuration
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

const connectDb = async () => {
    try {
        await mongoose.connect(process.env.MONGO);
        console.log("✅ Connected to MongoDB");
    } catch (error) {
        console.error("❌ MongoDB connection error:", error);
        process.exit(1);
    }
};

mongoose.connection.on("disconnected", () => {
    console.log("⚠️ Disconnected from MongoDB");
});

// API Routes
app.use("/api/user", UserRouter);
app.use("/api/quiz", QuizRouter);
app.use("/api/question", QuestionRouter);

const rooms = new Map();
const roomWorkers = new Map(); // Store room workers

app.set("rooms", rooms);
app.set("roomWorkers", roomWorkers);

io.on("connection", (socket) => {
    console.log(`🔵 New client connected: ${socket.id}`);

    socket.on("join-room", ({ roomId, username }) => {
        // First check if room exists
        if (!rooms.has(roomId)) {
            socket.emit("room-error", { message: "Room does not exist" });
            return;
        }

        const room = rooms.get(roomId);
        const user = { id: socket.id, username };
        room.participants.push(user);
        socket.join(roomId);

        console.log(`👤 ${username} joined Room ${roomId}`);

        let threadId = null;
        if (roomWorkers.has(roomId)) {
            const worker = roomWorkers.get(roomId);
            threadId = worker.threadId;
        }

        io.to(roomId).emit("room-details", {
            quizId: room.quizId,
            threadId: threadId,
            hostId: room.hostId,
        });

        io.to(roomId).emit("user-joined", { participants: room.participants });
    });

    socket.on("start-quiz", async ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) {
            const questions = await Question.find({ quizId: room.quizId });
            room.questions = questions;
            room.currentQuestionIndex = 0;
            room.questionStartTime = Date.now();
            room.leaderboard = new Map();
            room.roundScores = [];

            room.questionTimer = setTimeout(() => {
                handleQuestionTimeout(roomId, io);
            }, 30000);

            io.to(roomId).emit("question", {
                question: {
                    questionText: questions[0].questionText,
                    options: questions[0].options,
                    questionNumber: 1,
                    totalQuestions: questions.length,
                    timeLimit: 30
                }
            });
        }
    });

    socket.on("submit-answer", ({ roomId, answer }) => {
        const room = rooms.get(roomId);
        if (room) {
            const currentQuestion = room.questions[room.currentQuestionIndex];
            const timeTaken = (Date.now() - room.questionStartTime) / 1000;
            const isCorrect = currentQuestion.options[currentQuestion.correctOption] === answer;
            const score = isCorrect ? Math.max(1000 - Math.floor(timeTaken * 10), 100) : 0;

            const currentTotal = room.leaderboard.get(socket.id) || 0;
            room.leaderboard.set(socket.id, currentTotal + score);

            if (!room.roundScores[room.currentQuestionIndex]) {
                room.roundScores[room.currentQuestionIndex] = [];
            }

            room.roundScores[room.currentQuestionIndex].push({
                participantId: socket.id,
                username: room.participants.find(p => p.id === socket.id)?.username,
                timeTaken,
                score,
                isCorrect
            });

            socket.emit("answer-result", { isCorrect, score, timeTaken });
        }
    });

    socket.on("next-question", ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room && room.currentQuestionIndex < room.questions.length - 1) {
            moveToNextQuestion(roomId, io);
        } else if (room) {
            const finalLeaderboard = Array.from(room.leaderboard.entries())
                .map(([id, score]) => ({
                    username: room.participants.find(p => p.id === id)?.username,
                    totalScore: score
                }))
                .sort((a, b) => b.totalScore - a.totalScore)
                .slice(0, 3);

            io.to(roomId).emit("quiz-completed", { finalLeaderboard });
        }
    });


    socket.on("disconnect", () => {
        console.log(`🔴 Client disconnected: ${socket.id}`);

        rooms.forEach((room, roomId) => {
            room.participants = room.participants.filter(p => p.id !== socket.id);
            io.to(roomId).emit("user-joined", { participants: room.participants });

            // Notify the worker thread
            if (roomWorkers.has(roomId)) {
                roomWorkers.get(roomId).postMessage({
                    type: "REMOVE_PARTICIPANT",
                    data: { id: socket.id },
                });
            }
        });
    });
});

function handleQuestionTimeout(roomId, io) {
    const room = rooms.get(roomId);
    if (room) {
        clearTimeout(room.questionTimer);

        // Ensure roundScores array exists
        if (!room.roundScores) {
            room.roundScores = [];
        }

        if (room.currentQuestionIndex === undefined) {
            room.currentQuestionIndex = 0;
        }


        if (!room.roundScores[room.currentQuestionIndex]) {
            room.roundScores[room.currentQuestionIndex] = [];
        }

        const roundResults = room.roundScores[room.currentQuestionIndex]
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        io.to(roomId).emit("round-results", {
            roundLeaderboard: roundResults,
            correctAnswer: room.questions[room.currentQuestionIndex]?.options[room.questions[room.currentQuestionIndex]?.correctOption] || "N/A"
        });
    }
}


function moveToNextQuestion(roomId, io) {
    const room = rooms.get(roomId);
    if (room) {
        room.currentQuestionIndex++;
        room.questionStartTime = Date.now();

        room.questionTimer = setTimeout(() => {
            handleQuestionTimeout(roomId, io);
        }, 30000);

        const currentQuestion = room.questions[room.currentQuestionIndex];
        io.to(roomId).emit("question", {
            question: {
                questionText: currentQuestion.questionText,
                options: currentQuestion.options,
                questionNumber: room.currentQuestionIndex + 1,
                totalQuestions: room.questions.length,
                timeLimit: 30
            }
        });
    }
}

server.listen(PORT, async () => {
    await connectDb();
    console.log(`🚀 Server is running on port ${PORT}`);
});
