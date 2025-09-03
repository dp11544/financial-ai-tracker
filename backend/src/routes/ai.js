import express from "express";
const router = express.Router();

router.post("/parse", (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });

    // Split text into lines and remove empty lines
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const transactions = lines.map((line) => {
      // Detect type if included at the start
      let type = "expense";
      let cleanLine = line;

      if (/^income/i.test(line)) {
        type = "income";
        cleanLine = line.replace(/^income\s*/i, "");
      } else if (/^expense/i.test(line)) {
        type = "expense";
        cleanLine = line.replace(/^expense\s*/i, "");
      }

      // Extract description and amount
      const match = cleanLine.match(/([a-zA-Z\s]+)\s*(\d+)/);
      if (match) {
        const description = match[1].trim();
        const amount = Number(match[2]);
        return { description, amount, type, date: new Date() };
      }
      return null;
    }).filter(Boolean);

    if (!transactions.length) return res.status(400).json({ error: "No valid transactions found" });

    res.json(transactions);
  } catch (err) {
    console.error("AI parsing error:", err);
    res.status(500).json({ error: "AI parsing failed" });
  }
});

export default router;
