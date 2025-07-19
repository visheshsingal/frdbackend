import jwt from 'jsonwebtoken'

const optionalAuth = async (req, res, next) => {
    const { token } = req.headers;

    if (token) {
        try {
            const token_decode = jwt.verify(token, process.env.JWT_SECRET)
            req.body.userId = token_decode.id
        } catch (error) {
            console.log('Invalid token:', error.message)
            // Don't reject, just continue as guest
        }
    }
    next()
}

export default optionalAuth
