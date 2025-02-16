const mongoose = require("mongoose");
const Question = require("../models/Question");

const addQuestion = async (req, res) => {
    try {
        const { quizId, questionText, options, correctOption } = req.body;

        // Convert quizId to ObjectId if valid
        const isValidObjectId = mongoose.Types.ObjectId.isValid(quizId);
        const formattedQuizId = isValidObjectId ? new mongoose.Types.ObjectId(quizId) : quizId;

        const newQuestion = new Question({ quizId: formattedQuizId, questionText, options, correctOption });
        await newQuestion.save();

        res.status(201).json({ message: "Question added", question: newQuestion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getAllQuestions = async (req, res) => {
    try {
        const { quizId } = req.params;

        // Ensure quizId is a valid ObjectId
        const isValidObjectId = mongoose.Types.ObjectId.isValid(quizId);
        const query = isValidObjectId ? { quizId: new mongoose.Types.ObjectId(quizId) } : { quizId };

        const questions = await Question.find(query).exec();
        res.status(200).json(questions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const deleteQuestion = async (req, res) => {
    try {
        const { questionId } = req.params;

        // Ensure questionId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(questionId)) {
            return res.status(400).json({ error: "Invalid question ID format" });
        }

        const deletedQuestion = await Question.findByIdAndDelete(questionId);
        if (!deletedQuestion) {
            return res.status(404).json({ message: "Question not found" });
        }

        res.status(200).json({ message: "Question deleted", deletedQuestion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
const updateQuestion = async (req, res) => {
    try {
        const { questionId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(questionId)) {
            return res.status(400).json({ error: "Invalid question ID format" });
        }
        const updatedQuestion = req.body;
        const question = await Question.findByIdAndUpdate(questionId, updatedQuestion, { new: true });
        if (!question) {
            return res.status(404).json({ message: "Question not found" });
        }
        res.status(200).json({ message: "Question updated", question });  

    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { addQuestion, getAllQuestions, deleteQuestion, updateQuestion };
