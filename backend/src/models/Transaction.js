import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
  user: { type: String, required: true }, // user's email
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ["income", "expense"], default: "expense" },
  date: { type: Date, default: Date.now },
});

export default mongoose.model("Transaction", TransactionSchema);
