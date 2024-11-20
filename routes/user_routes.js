const express = require("express");
const bcrypt = require("bcrypt");
const { body, param, validationResult } = require("express-validator");
const User = require("../models/user_model");
const RadixTree = require("../utils/radixTree");
const crypto = require("crypto");

const router = express.Router();
const userCache = new RadixTree(); // RadixTree instance for caching tokens

// Helper function for validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: "error", errors: errors.array() });
  }
  next();
};

// Generate a unique token
const generateToken = () => crypto.randomBytes(16).toString("hex");

// Response utility function
const respond = (res, status, message, data = null) => {
  res.status(status).json({ status: status === 200 ? "success" : "error", message, data });
};

// **Register a New User**
router.post(
  "/register",
  [
    body("username")
      .isString()
      .isLength({ min: 3, max: 20 })
      .withMessage("Username must be between 3 and 20 characters."),
    body("email").isEmail().withMessage("A valid email is required."),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long."),
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

      const token = generateToken();
      userCache.insert(newUser._id.toString(), token);

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
    body("username").optional().isString().withMessage("Invalid username."),
    body("email").optional().isEmail().withMessage("Invalid email."),
    body("password").isLength({ min: 1 }).withMessage("Password is required."),
  ],
  handleValidationErrors,
  async (req, res) => {
    const { username, email, password } = req.body;

    try {
      const user = await User.findOne({ $or: [{ username }, { email }] });
      if (!user) {
        return respond(res, 404, "User not found.");
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return respond(res, 401, "Invalid password.");
      }

      const token = generateToken();
      userCache.insert(user._id.toString(), token);

      user.loginTime = new Date();
      await user.save();

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
  [body("userId").isMongoId().withMessage("Invalid user ID.")],
  handleValidationErrors,
  async (req, res) => {
    const { userId } = req.body;

    try {
      const user = await User.findById(userId);
      if (!user) {
        return respond(res, 404, "User not found.");
      }

      const token = userCache.search(userId);
      userCache.delete(userId);

      user.logoutTime = new Date();
      await user.save();

      respond(res, 200, "Logout successful.");
    } catch (error) {
      console.error("Logout Error:", error);
      respond(res, 500, "Failed to logout.");
    }
  }
);

// **Get Cached Token by User ID**
router.get(
  "/cache/:id",
  param("id").isMongoId().withMessage("Invalid user ID."),
  handleValidationErrors,
  (req, res) => {
    const { id } = req.params;

    const cachedToken = userCache.search(id);
    if (cachedToken) {
      respond(res, 200, "Cache hit.", { token: cachedToken });
    } else {
      respond(res, 404, "Cache miss.");
    }
  }
);

// **Fetch All Users**
router.get("/", async (req, res) => {
  try {
    const users = await User.find();
    const usersWithTokens = users.map((user) => ({
      ...user.toObject(),
      token: userCache.search(user._id.toString()) || null,
    }));

    respond(res, 200, "Users fetched successfully.", usersWithTokens);
  } catch (error) {
    console.error("Fetch Users Error:", error);
    respond(res, 500, "Failed to fetch users.");
  }
});

// **Search Token by Username and Manage Inactive Tokens**
router.get(
  "/search-token/:username",
  param("username")
    .isString()
    .withMessage("Invalid username."),
  handleValidationErrors,
  async (req, res) => {
    const { username } = req.params;

    try {
      const user = await User.findOne({ username });
      if (!user) {
        return respond(res, 404, "User not found.");
      }

      const token = userCache.search(user._id.toString());
      if (!token) {
        return respond(res, 404, "Token not found for this user.");
      }

      // Simulate token status check (you can implement actual logic here)
      const isTokenActive = true; // Replace with your token validation logic

      if (!isTokenActive) {
        userCache.delete(user._id.toString());
        return respond(res, 200, "Token was inactive and has been deleted.");
      }

      respond(res, 200, "Token found.", { username, token, status: "active" });
    } catch (error) {
      console.error("Search Token Error:", error);
      respond(res, 500, "Failed to search token.");
    }
  }
);

// **Validate Token**
router.post(
  "/validate-token",
  [
    body("userId").isMongoId().withMessage("Invalid user ID."),
    body("token").isString().withMessage("Token is required."),
  ],
  handleValidationErrors,
  async (req, res) => {
    const { userId, token } = req.body;

    try {
      const cachedToken = userCache.search(userId);

      if (!cachedToken) {
        return respond(res, 404, "Token not found for this user.");
      }

      if (cachedToken !== token) {
        return respond(res, 401, "Token is invalid.");
      }

      // Optionally, validate token expiration or other criteria here
      respond(res, 200, "Token is valid.", { userId, token });
    } catch (error) {
      console.error("Validate Token Error:", error);
      respond(res, 500, "Failed to validate token.");
    }
  }
);


module.exports = router;
