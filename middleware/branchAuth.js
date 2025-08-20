import jwt from 'jsonwebtoken'

const branchAuth = async (req, res, next) => {
    try {
        const { token } = req.headers
        if (!token) {
            return res.status(401).json({success: false, message: "Not Authorized Login Again"})
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded || decoded.role !== 'branch') {
            return res.status(401).json({success: false, message: "Not Authorized Login Again"})
        }
        req.branchUser = decoded
        req.branchGym = decoded.gym // Extract gym from token
        next()
    } catch (error) {
        console.log(error)
        res.status(401).json({ success: false, message: "Not Authorized Login Again" })
    }
}

export default branchAuth 