const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token missing or invalid.' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'feedesk_super_secret_jwt_key_2026_production', (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Token expired or forbidden.' });
    }
    req.user = user;
    next();
  });
};

const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Permission denied: Insufficient privileges.' });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole
};
