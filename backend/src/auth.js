import express from "express";
import passport from "passport";
const router = express.Router();

router.get("/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get("/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("http://localhost:3000/dashboard");
  }
);

router.get("/user", (req, res) => res.send(req.user || null));

router.get("/logout", (req, res) => {
  req.logout(() => res.redirect("http://localhost:3000/"));
});

export default router;
