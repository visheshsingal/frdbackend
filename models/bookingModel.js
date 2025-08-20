import mongoose from 'mongoose'

const bookingSchema = new mongoose.Schema(
    {
        userId: { type: String },
        gym: { type: String, required: true },
        facility: { type: String, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String, required: true }
    },
    { timestamps: true }
)

const bookingModel = mongoose.models.booking || mongoose.model('booking', bookingSchema)
export default bookingModel; 