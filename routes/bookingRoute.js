import express from 'express'
import { createBooking, listBookings, getUserBookings, getBranchBookings, getBranchMembers } from '../controllers/bookingController.js'
import optionalAuth from '../middleware/auth.js'
import adminAuth from '../middleware/adminAuth.js'
import branchAuth from '../middleware/branchAuth.js'

const bookingRouter = express.Router()

bookingRouter.post('/', optionalAuth, createBooking)
bookingRouter.get('/list', adminAuth, listBookings)
bookingRouter.get('/user', optionalAuth, getUserBookings)
bookingRouter.get('/branch/bookings', branchAuth, getBranchBookings)
bookingRouter.get('/branch/members', branchAuth, getBranchMembers)
export default bookingRouter 