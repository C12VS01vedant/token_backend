const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    mongoose
    .connect(
      "mongodb+srv://vedant12tools:mZ7VytTjwUYdjsqh@backenddb.wmfaz.mongodb.net/?retryWrites=true&w=majority&appName=BackendDB"
    )
    console.log(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

module.exports=connectDB;