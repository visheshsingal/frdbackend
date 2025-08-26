import express from 'express'
import { 
  createBooking, 
  listBookings, 
  getUserBookings, 
  getBranchBookings, 
  getBranchMembers,
  cancelBooking,
  getBookedSlots 
} from '../controllers/bookingController.js'
import optionalAuth from '../middleware/auth.js'
import adminAuth from '../middleware/adminAuth.js'
import branchAuth from '../middleware/branchAuth.js'

const bookingRouter = express.Router()

bookingRouter.post('/', optionalAuth, createBooking)
bookingRouter.get('/list', adminAuth, listBookings)
bookingRouter.get('/user', optionalAuth, getUserBookings)
bookingRouter.post('/user', optionalAuth, getUserBookings) // Keep both methods
bookingRouter.get('/branch/bookings', branchAuth, getBranchBookings) // FIXED: This was broken
bookingRouter.get('/branch/members', branchAuth, getBranchMembers)
bookingRouter.post('/cancel/:bookingId', branchAuth, cancelBooking)
bookingRouter.get('/booked-slots', optionalAuth, getBookedSlots)

export default bookingRouter