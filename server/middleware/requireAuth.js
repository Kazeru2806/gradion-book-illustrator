const { getUserIdFromRequest } = require('../session');

function requireAuth(req, res, next) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.userId = userId;
  next();
}

module.exports = {
  requireAuth,
};
