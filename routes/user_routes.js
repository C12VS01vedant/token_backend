const express = require("express");
const redis = require("redis");
const bcrypt = require("bcrypt");
const { body, param, validationResult } = require("express-validator");
const User = require("../models/user_model");
const crypto = require("crypto");

const router = express.Router();
const redisClient = redis.createClient();

// Connect to Redis
redisClient.on("error", (err) => console.error("Redis Error:", err));
redisClient.connect();

// Helper function for validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: "error", errors: errors.array() });
  }
  next();
};

// Response utility function
const respond = (res, status, message, data = null) => {
  const responseStatus = status >= 200 && status < 300 ? "success" : "error"; // Success for 2xx status codes
  res.status(status).json({ status: responseStatus, message, data });
};



// **Generate Token and Store Metadata**
const generateToken = async (userId) => {
  const token = crypto.randomBytes(16).toString("hex");
  const tokenData = {
    userId,
    status: "active",
    createdAt: new Date().toISOString(),
    deletedAt: null,
  };

  // Store token in Redis with 10 days expiry
  await redisClient.set(token, JSON.stringify(tokenData), { EX: 864000 });

  // Persist token history in Redis (without expiry)
  await redisClient.hSet(`token-history:${userId}`, token, JSON.stringify(tokenData));

  return token;
};

// **Register a New User**
router.post(
  "/register",
  [
    body("username").isString().isLength({ min: 3, max: 20 }).withMessage("Username must be between 3 and 20 characters."),
    body("email").isEmail().withMessage("A valid email is required."),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters long."),
  ],
  handleValidationErrors,
  async (req, res) => {
    const { username, email, password } = req.body;

    try {
      const existingUser = await User.findOne({ $or: [{ email }, { username }] });
      if (existingUser) {
        return respond(res, 400, "Email or username already in use.");
      }

      const newUser = new User({ username, email, password });
      await newUser.save();

      const token = await generateToken(newUser._id);

      respond(res, 201, "User registered successfully.", { token });
    } catch (error) {
      console.error("Registration Error:", error);
      respond(res, 500, "Failed to register user.");
    }
  }
);

// **Login a User**
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("A valid email is required."),
    body("password").isLength({ min: 1 }).withMessage("Password is required."),
  ],
  handleValidationErrors,
  async (req, res) => {
    const { email, password } = req.body;

    try {
      const user = await User.findOne({ email });
      if (!user) {
        return respond(res, 404, "User not found.");
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return respond(res, 401, "Invalid password.");
      }

      const token = await generateToken(user._id);

      respond(res, 200, "Login successful.", { token });
    } catch (error) {
      console.error("Login Error:", error);
      respond(res, 500, "Failed to login.");
    }
  }
);


// **Logout a User**
router.post(
  "/logout",
  [body("token").isString().withMessage("Token is required.")],
  handleValidationErrors,
  async (req, res) => {
    const { token } = req.body;

    try {
      // Check if the token exists in Redis
      const tokenDataString = await redisClient.get(token);
      if (!tokenDataString) {
        return respond(res, 404, "Token not found.");
      }

      const tokenData = JSON.parse(tokenDataString);

      // Set token status to inactive and record the time of deactivation
      tokenData.status = "inactive";
      tokenData.deletedAt = new Date().toISOString();

      // Update the token history in Redis (save the inactive token data)
      await redisClient.hSet(`token-history:${tokenData.userId}`, token, JSON.stringify(tokenData));

      // Delete the active token from Redis to effectively log the user out
      await redisClient.del(token);

      return respond(res, 200, "Logout successful.");
    } catch (error) {
      console.error("Logout Error:", error);
      return respond(res, 500, "Failed to logout.");
    }
  }
);


// **Delete Token**
router.post(
  "/delete-token",
  [body("token").isString().withMessage("Token is required.")],
  handleValidationErrors,
  async (req, res) => {
    const { token } = req.body;

    try {
      // Check if the token exists in Redis
      const tokenDataString = await redisClient.get(token);
      if (!tokenDataString) {
        return respond(res, 404, "Token not found.");
      }

      const tokenData = JSON.parse(tokenDataString);
      tokenData.status = "inactive";
      tokenData.deletedAt = new Date().toISOString();

      // Update the token history in Redis
      await redisClient.hSet(`token-history:${tokenData.userId}`, token, JSON.stringify(tokenData));

      // Remove the active token from Redis
      await redisClient.del(token);

      respond(res, 200, "Token deleted successfully.");
    } catch (error) {
      console.error("Delete Token Error:", error);
      respond(res, 500, "Failed to delete token.");
    }
  }
);


// **Reactivate Token**
router.post(
  "/reactivate-token",
  [
    body("token").isString().withMessage("Token is required."),
    body("userId").isMongoId().withMessage("Invalid user ID."),
  ],
  handleValidationErrors,
  async (req, res) => {
    const { token, userId } = req.body;

    try {
      // Fetch token data from the token history
      const tokenDataString = await redisClient.hGet(`token-history:${userId}`, token);
      if (!tokenDataString) {
        return respond(res, 404, "Token not found in history.");
      }

      const tokenData = JSON.parse(tokenDataString);
      if (tokenData.status === "active") {
        return respond(res, 400, "Token is already active.");
      }

      // Reactivate the token
      tokenData.status = "active";
      tokenData.deletedAt = null;

      // Update the active token in Redis cache (with an expiry of 10 days)
      await redisClient.set(token, JSON.stringify(tokenData), { EX: 864000 }); // 10 days expiry

      // Update the token history in Redis
      await redisClient.hSet(`token-history:${userId}`, token, JSON.stringify(tokenData));

      respond(res, 200, "Token reactivated successfully.");
    } catch (error) {
      console.error("Reactivate Token Error:", error);
      respond(res, 500, "Failed to reactivate token.");
    }
  }
);


// **Fetch Token History**
router.get(
  "/token-history/:userId",
  param("userId").isMongoId().withMessage("Invalid user ID."),
  handleValidationErrors,
  async (req, res) => {
    const { userId } = req.params;

    try {
      // Fetch all token history for the user from Redis
      const history = await redisClient.hGetAll(`token-history:${userId}`);
      if (!history || Object.keys(history).length === 0) {
        return respond(res, 404, "No token history found for this user.");
      }

      // Map the history to the desired structure
      const tokens = Object.entries(history).map(([token, data]) => ({
        token,
        ...JSON.parse(data),
      }));

      respond(res, 200, "Token history fetched successfully.", tokens);
    } catch (error) {
      console.error("Token History Error:", error);
      respond(res, 500, "Failed to fetch token history.");
    }
  }
);


module.exports = router;
