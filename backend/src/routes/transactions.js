import express from "express";
import Transaction from "../models/Transaction.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { user, description, amount, type } = req.body;
    const transaction = new Transaction({ user, description, amount, type });
    await transaction.save();
    res.json(transaction);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/:user", async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.params.user });
    res.json(transactions);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
