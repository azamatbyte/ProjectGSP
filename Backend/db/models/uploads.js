
const mongoose= require('mongoose');

const uploadsSchema= mongoose.Schema(
    {
        file_link:{
            type: String,
            required: true
        }
    },{ timestamps: true }
);


module.exports=mongoose.model("Images",uploadsSchema)