import jwt from 'jsonwebtoken'

const adminAuth = async (req,res,next) => {
	try {
		const { token } = req.headers
		if (!token) {
			return res.status(401).json({success:false,message:"Not Authorized Login Again"})
		}
		const decoded = jwt.verify(token,process.env.JWT_SECRET);
		if (!decoded || decoded.role !== 'admin' || decoded.email !== 'frdgym@gmail.com') {
			return res.status(401).json({success:false,message:"Not Authorized Login Again"})
		}
		next()
	} catch (error) {
		console.log(error)
		res.status(401).json({ success: false, message: "Not Authorized Login Again" })
	}
}

export default adminAuth