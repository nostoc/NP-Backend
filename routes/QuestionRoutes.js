const express = require("express");
const {addQuestion, getAllQuestions, deleteQuestion, updateQuestion} = require("../controllers/QuestionController");

const router = express.Router();

// Add a question to a quiz
router.post("/add", addQuestion);

// Get all questions for a quiz
router.get("/quiz/:quizId", getAllQuestions);

// Delete a question
router.delete("/:questionId", deleteQuestion);

// Update a question
router.patch("/:questionId", updateQuestion);

module.exports = router;
