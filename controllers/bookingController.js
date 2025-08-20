import bookingModel from "../models/bookingModel.js";
import optionalAuth from "../middleware/auth.js";

// Create a booking
const createBooking = async (req, res) => {
	try {
		const { userId, gym, facility, name, email, phone } = req.body;

		if (!gym || !facility || !name || !email || !phone) {
			return res.status(400).json({ success: false, message: 'Missing required fields' });
		}

		const booking = new bookingModel({ userId, gym, facility, name, email, phone });
		await booking.save();

		return res.json({ success: true, message: 'Booking created', booking });
	} catch (error) {
		console.log(error);
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
const getUserBookings = async (req, res) => {
	try {
		const { userId } = req.body;
		
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

export { createBooking, listBookings, getUserBookings, getBranchBookings, getBranchMembers }; 