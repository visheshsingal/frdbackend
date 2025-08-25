import mongoose from 'mongoose'

const bookingSchema = new mongoose.Schema(
    {
        userId: { type: String },
        gym: { type: String, required: true },
        facility: { type: String, required: true },
        date: { 
            type: Date, 
            required: true,
            set: function(date) {
                // Normalize date to start of day in UTC when saving
                const d = new Date(date);
                d.setUTCHours(0, 0, 0, 0);
                return d;
            }
        },
        timeSlot: { type: String, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String, required: true },
        status: {
          type: String,
          enum: ['confirmed', 'cancelled'],
          default: 'confirmed'
        }
    },
    { timestamps: true }
)

// Add index for better performance
bookingSchema.index({ gym: 1, facility: 1, date: 1, timeSlot: 1, status: 1 });

const bookingModel = mongoose.models.booking || mongoose.model('booking', bookingSchema)
export default bookingModel;