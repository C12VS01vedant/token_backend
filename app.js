const express = require('express');
const cors = require('cors');
const redis = require('redis');
const userRoutes = require('./routes/user_routes'); // Ensure this path is correct
const connectDB = require('./config/db'); // Ensure this path is correct

const app = express();

// Connect to the database
connectDB();

// Redis client setup
const redisClient = redis.createClient();

// Handling Redis connection errors
redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
});

// Connect Redis client
redisClient.connect()
    .then(() => console.log('Connected to Redis'))
    .catch((err) => console.error('Redis Connection Error:', err));

// Pass Redis client to routes if needed
app.use((req, res, next) => {
    req.redisClient = redisClient;
    next();
});

// CORS configuration
app.use(cors({
    origin: 'http://localhost:4200', // Angular app's URL or frontend's URL
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware to parse JSON request body
app.use(express.json());

// Middleware to parse URL-encoded data
app.use(express.urlencoded({ extended: true }));

// Log incoming requests for debugging
app.use((req, res, next) => {
    console.log(`Incoming request: ${req.method} ${req.url}`);
    next();
});

// Routes
app.use('/users', userRoutes); // Ensure the userRoutes path is correctly imported

// Server setup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
