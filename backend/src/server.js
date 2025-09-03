import express from "express";
import mongoose from "mongoose";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import cors from "cors";
import dotenv from "dotenv";
import User from "./models/User.js";
import Transaction from "./models/Transaction.js";

dotenv.config();

const app = express();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ Connected to MongoDB"))
.catch(err => console.error("❌ MongoDB Error:", err));

// Middleware
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport Google Strategy
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback",
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        user = await User.create({
          googleId: profile.id,
          name: profile.displayName,
          email: profile.emails[0].value,
          picture: profile.photos[0].value,
        });
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Google Auth Routes
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => res.redirect("http://localhost:3000/dashboard")
);
app.get("/user", (req, res) => res.send(req.user || null));
app.get("/logout", (req, res) => req.logout(() => res.redirect("http://localhost:3000/")));

// AI Parser for multiple transactions
app.post("/api/ai/parse", (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });

    // Regex to extract multiple transactions: description + amount
    const regex = /([a-zA-Z\s]+?)\s*\$?(\d+)/gi;
    const matches = [...text.matchAll(regex)];

    if (!matches.length) return res.status(400).json({ error: "No transactions found" });

    const transactions = matches.map((m) => {
      let description = m[1].trim().replace(/^\s*and\s+/i, "");
      return { description, amount: Number(m[2]), type: "expense", date: new Date() };
    });

    res.json(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI parsing failed" });
  }
});

// Transactions Routes
app.post("/api/transactions", async (req, res) => {
  try {
    const { user, description, amount, type } = req.body;
    const transaction = new Transaction({ user, description, amount, type });
    await transaction.save();
    res.json(transaction);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/transactions/:user", async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.params.user });
    res.json(transactions);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Start server
app.listen(process.env.PORT, () => console.log(`🚀 Backend running on http://localhost:${process.env.PORT}`));
