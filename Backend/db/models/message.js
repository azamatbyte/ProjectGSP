const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true
    },
    user: {
      type: String
    },
    created_at: {
      type: Date,
      // default: Date.now, // Use the current date and time
    },
    updated_at: {
      type: Date,
      // default: Date.now, // Use the current date and time
    },
  },
  {
    timestamps: true,
    underscored: true,
    // freezeTableName: true,
  }
);

module.exports = mongoose.model("Message", messageSchema);
