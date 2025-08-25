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
bookingRouter.post('/user', optionalAuth, getUserBookings) // Changed to POST to accept userId in body
bookingRouter.get('/branch/bookings', branchAuth, getBranchBookings)
bookingRouter.get('/branch/members', branchAuth, getBranchMembers)
bookingRouter.post('/cancel/:bookingId', branchAuth, cancelBooking)
bookingRouter.get('/booked-slots', optionalAuth, getBookedSlots)

export default bookingRouter