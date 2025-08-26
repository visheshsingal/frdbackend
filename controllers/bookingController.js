import bookingModel from "../models/bookingModel.js";
import nodemailer from "nodemailer";

// Create a booking
const createBooking = async (req, res) => {
  try {
    const { userId, gym, facility, date, timeSlot, name, email, phone } = req.body;
    console.log('Booking request received:', { gym, facility, date, timeSlot });

    if (!gym || !facility || !date || !timeSlot || !name || !email || !phone) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Validate date format
    const bookingDate = new Date(date);
    if (isNaN(bookingDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }

    // Normalize the date to start of day in UTC (this is the key fix)
    const normalizedDate = new Date(bookingDate);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    // Create search range
    const startOfDay = new Date(normalizedDate);
    const endOfDay = new Date(normalizedDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    console.log('Checking for existing bookings between:', startOfDay, 'and', endOfDay);
    console.log('Using normalized date:', normalizedDate);

    // Check if the time slot is already booked
    const existingBooking = await bookingModel.findOne({
      gym,
      facility,
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      timeSlot,
      status: 'confirmed'
    });

    if (existingBooking) {
      console.log('Existing booking found:', existingBooking);
      return res.status(400).json({ 
        success: false, 
        message: 'This time slot is already booked',
        existingBooking: {
          id: existingBooking._id,
          date: existingBooking.date,
          timeSlot: existingBooking.timeSlot
        }
      });
    }

    // Create the booking with the normalized date (this ensures consistency)
    const booking = new bookingModel({ 
      userId, 
      gym, 
      facility, 
      date: normalizedDate,  // Use normalized date instead of original
      timeSlot, 
      name, 
      email, 
      phone 
    });
    
    await booking.save();
    console.log('Booking created successfully:', booking._id);

    return res.json({ success: true, message: 'Booking created', booking });
  } catch (error) {
    console.error('Booking error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// List bookings for admin
const listBookings = async (req, res) => {
  try {
    const bookings = await bookingModel.find({}).sort({ createdAt: -1 });
    return res.json({ success: true, bookings });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get user bookings
// Get user bookings - UPDATED VERSION
const getUserBookings = async (req, res) => {
	try {
	  // Try to get userId from body (POST) or query (GET)
	  let userId = req.body.userId || req.query.userId;
	  
	  // If no userId provided, try to get from authenticated user
	  if (!userId && req.user) {
		userId = req.user._id;
	  }
	  
	  if (!userId) {
		return res.status(400).json({ success: false, message: 'User ID required' });
	  }
  
	  const bookings = await bookingModel.find({ userId }).sort({ createdAt: -1 });
	  return res.json({ success: true, bookings });
	} catch (error) {
	  console.log(error);
	  return res.status(500).json({ success: false, message: error.message });
	}
  };
// Get branch bookings (for branch portal)
const getBranchBookings = async (req, res) => {
  try {
    const gym = req.branchGym; // Get gym from token via middleware
    
    if (!gym) {
      return res.status(400).json({ success: false, message: 'Gym not found in token' });
    }

    const bookings = await bookingModel.find({ gym }).sort({ createdAt: -1 });
    return res.json({ success: true, bookings, gym });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get branch members (unique users who booked at this gym)
const getBranchMembers = async (req, res) => {
  try {
    const gym = req.branchGym; // Get gym from token via middleware
    
    if (!gym) {
      return res.status(400).json({ success: false, message: 'Gym not found in token' });
    }

    // Get unique users who have bookings at this gym
    const bookings = await bookingModel.find({ gym }).select('name email phone createdAt');
    
    // Create unique members list
    const membersMap = new Map();
    bookings.forEach(booking => {
      const key = booking.email;
      if (!membersMap.has(key)) {
        membersMap.set(key, {
          name: booking.name,
          email: booking.email,
          phone: booking.phone,
          firstBooking: booking.createdAt,
          bookingCount: 1
        });
      } else {
        const member = membersMap.get(key);
        member.bookingCount += 1;
        if (booking.createdAt < member.firstBooking) {
          member.firstBooking = booking.createdAt;
        }
      }
    });

    const members = Array.from(membersMap.values()).sort((a, b) => b.firstBooking - a.firstBooking);
    return res.json({ success: true, members, gym });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get booked time slots for a specific gym and date
const getBookedSlots = async (req, res) => {
  try {
    const { gym, date } = req.query;
    
    if (!gym || !date) {
      return res.status(400).json({ success: false, message: 'Gym and date are required' });
    }
    
    // Convert date string to Date object (start of day)
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    
    // End of day
    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);
    
    // Find all bookings for this gym and date
    const bookings = await bookingModel.find({
      gym,
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: 'confirmed'
    });
    
    // Group booked slots by facility
    const bookedSlots = {};
    bookings.forEach(booking => {
      if (!bookedSlots[booking.facility]) {
        bookedSlots[booking.facility] = [];
      }
      bookedSlots[booking.facility].push(booking.timeSlot);
    });
    
    return res.json({ success: true, bookedSlots });
  } catch (error) {
    console.error('Error fetching booked slots:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Cancel booking and send email
const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const gym = req.branchGym; // Get gym from token via middleware
    
    // Find the booking
    const booking = await bookingModel.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    
    // Check if the booking belongs to the branch of the authenticated branch admin
    if (booking.gym !== gym) {
      return res.status(403).json({ success: false, message: 'Not authorized to cancel this booking' });
    }
    
    // Check if booking is already cancelled
    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
    }
    
    // Update booking status
    booking.status = 'cancelled';
    await booking.save();
    
    // Create email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    
    // Format date for email
    const bookingDate = new Date(booking.date).toLocaleDateString();
    
    // Send cancellation email
    const emailText = `Dear ${booking.name},\n\nWe regret to inform you that your booking for ${booking.facility} at ${booking.gym} on ${bookingDate} (${booking.timeSlot}) has been cancelled.\n\nIf you have any questions, please contact us at +91 92781 60000\n\nBest regards,\n${gym} Team`;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">Booking Cancellation Notice</h2>
        <p>Dear ${booking.name},</p>
        <p>We regret to inform you that your booking for <strong>${booking.facility}</strong> at <strong>${booking.gym}</strong> on <strong>${bookingDate}</strong> (${booking.timeSlot}) has been cancelled.</p>
        <p>If you have any questions or would like to reschedule, please contact us at +91 92781 60000.</p>
        <br>
        <p>Best regards,<br>${gym} Team</p>
      </div>
    `;
    
    try {
      const info = await transporter.sendMail({
        from: `"${gym}" <${process.env.EMAIL_USER}>`,
        to: booking.email,
        subject: 'Booking Cancellation Notice',
        text: emailText,
        html: emailHtml,
      });
      
      console.log('Cancellation email sent: %s', info.messageId);
      res.json({ success: true, message: 'Booking cancelled successfully and email sent' });
      
    } catch (emailError) {
      console.error('Failed to send cancellation email:', emailError);
      // Still return success but with a message that email failed
      res.json({ 
        success: true, 
        message: 'Booking cancelled successfully but failed to send email notification',
        emailError: emailError.message 
      });
    }
    
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

export { 
  createBooking, 
  listBookings, 
  getUserBookings, 
  getBranchBookings, 
  getBranchMembers, 
  getBookedSlots,
  cancelBooking 
};