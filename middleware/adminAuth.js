<<<<<<< Updated upstream
import jwt from 'jsonwebtoken';

const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    console.log('Token received:', token); // DEBUG
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }
=======
import jwt from 'jsonwebtoken'
import UserModel from '../models/userModel.js'

const adminAuth = async (req, res, next) => {
	try {
		const { token } = req.headers
		if (!token) {
			return res.status(401).json({success: false, message: "Not Authorized Login Again"})
		}
		
		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		if (!decoded || !decoded.id) {
			return res.status(401).json({success: false, message: "Not Authorized Login Again"})
		}

		// Find user in database and verify admin role
		const user = await UserModel.findById(decoded.id).select('-password');
		if (!user || user.role !== 'admin') {
			return res.status(401).json({success: false, message: "Not Authorized Login Again"})
		}

		// Attach user to request for use in controllers
		req.user = user;
		next()
	} catch (error) {
		console.log(error)
		res.status(401).json({ success: false, message: "Not Authorized Login Again" })
	}
}
>>>>>>> Stashed changes

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    console.log('Decoded token:', decoded); // DEBUG
    
    // Check if user is admin
    if (decoded.role !== 'admin') {
      console.log('Role check failed. Role is:', decoded.role); // DEBUG
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

export default adminAuth;