const jwt = require("jsonwebtoken");
/**
 * Middleware que verifica el token JWT en el header Authorization.
 * Si el token es válido, inyecta req.user = { usuarioId, rolId }.
 * Si no, responde 401 Unauthorized **/
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer <token>"
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Token no proporcionado" });
  };
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { usuarioId: decoded.usuarioId, rolId: decoded.rolId };
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Token inválido o expirado" });
  ;}
};
//Middleware que restringe el acceso solo a supervisores.
function soloSupervisor(req, res, next){
    const ROL_SUPERVISOR = 2;
    if(!req.user || Number(req.user.rolId) != ROL_SUPERVISOR){
        return res.status(403).json({
            success: false,
            message: 'Aceeso denegado'
        });
    };
    next();
};

module.exports = { authMiddleware, soloSupervisor };