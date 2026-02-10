const mongoose = require("mongoose");

const group_listSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'group'
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student'
    },
  },
  {
    timestamps: false,
    underscored: true,
    // freezeTableName: true,
  }
);


module.exports = mongoose.model("Group_list", group_listSchema);
