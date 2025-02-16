const express = require("express");
const Quiz = require("../models/Quiz");
const { Create, getUsersQuizes, deleteQuiz, setLive, setNotLive } = require("../controllers/QuizController");

const router = express.Router();

// Create a new quiz
router.post("/create", Create);
// Get all quizzes for a teacher
router.get("/user/:userId", getUsersQuizes);

// Delete a quiz
router.delete("/:quizId", deleteQuiz);

// Set the quiz as live (create room)
router.patch("/set-live/:quizId", (req, res) => {
    // Pass `io` and `rooms` to the controller
    setLive(req, res, req.app.get("io"), req.app.get("rooms"));
});

// Set the quiz as not live
// Set the quiz as not live (stop room)
router.patch("/set-not-live/:quizId", (req, res) => {
    setNotLive(req, res, req.app.get("io"), req.app.get("rooms"));
});

module.exports = router;