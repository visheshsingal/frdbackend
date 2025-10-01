import jwt from 'jsonwebtoken'
import UserModel from "../models/userModel.js";

const adminAuth = async (req, res, next) => {
  try {
    const { token } = req.headers;
    if (!token) {
      return res.status(401).json({ success: false, message: "Not Authorized Login Again" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user exists and is admin
    const user = await UserModel.findById(decoded.id);
    if (!user || !user.isAdmin || user.email !== 'frdgym@gmail.com') {
      return res.status(401).json({ success: false, message: "Not Authorized Login Again" });
    }

    req.user = user; // Attach user to request
    next();
  } catch (error) {
    console.log(error);
    res.status(401).json({ success: false, message: "Not Authorized Login Again" });
  }
}

export default adminAuth;