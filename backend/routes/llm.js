const express = require('express');
const { chatCompletion } = require('../services/llm');

const router = express.Router();

// POST /api/llm/chat  { messages: { role, content }[] }
router.post('/chat', async (req, res, next) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array' });
    }
    const text = await chatCompletion(messages);
    res.json({ message: text });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
