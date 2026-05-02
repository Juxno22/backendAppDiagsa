const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const connection = require("../config/connection");

async function createUser(userData) {
  const query = (sql, values) => {
    return new Promise((resolve, reject) => {
      connection.query(sql, values, (error, results) => {
        if (error) {
          reject(error);
        } else {
          resolve(results);
        }
      });
    });
  };
  try {
    //verificar que no existan los datos relacionados
    const rolExits = await query("SELECT * FROM roles WHERE rolId = ?", [
      userData.rolId,
    ]);
    if (rolExits.length === 0) {
      throw new Error("El rol no existe");
    }
    const puestoExits = await query("SELECT * FROM puesto WHERE puestoId = ?", [
      userData.puestoId,
    ]);
    if (puestoExits.length === 0) {
      throw new Error("El puesto no existe");
    }
    const existingUser = await query(
      "SELECT * FROM usuarios WHERE usuario = ?",
      [userData.usuario],
    );
    if (existingUser.length > 0) {
      throw new Error("El usuario ya existe");
    }
    //Encriptar la contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(userData.contrasenia, saltRounds);
    //Insertar nuevo usuario
    const result = await query(
    `INSERT INTO usuarios (
        nombre, apPaterno, apMaterno, usuario, contrasenia,
        puestoId, tipoId, sueldoId, rolId,
        fechaContratacion, departamento, jefe_inmediato, sueldo,
        genero, estado_civil, numero_seguro_social, RFC,
        fecha_nacimiento, curp, celular, es_padre_madre,
        fecha_contrato_indeterminado_3m
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
        userData.nombre, userData.apPaterno, userData.apMaterno,
        userData.usuario, hashedPassword,
        userData.puestoId, userData.tipoId, userData.sueldoId || null, userData.rolId,
        userData.fechaContratacion, userData.departamento, userData.jefe_inmediato || null,
        userData.sueldo || null,
        userData.genero || null, userData.estado_civil || null,
        userData.numero_seguro_social || null, userData.RFC || null,
        userData.fecha_nacimiento || null, userData.curp || null,
        userData.celular || null, userData.es_padre_madre || null,
        userData.fecha_contrato_indeterminado_3m || null,
    ]
);
    return {
      success: true,
      message: "Usuario creado exitosamente",
      usuarioId: result.insertId,
      usuario: userData.usuario,
      rolId: userData.rolId,
    };
  } catch (error) {
    console.error("Error al crear usuario:", error);
    return {
      success: false,
      message: error.message || "Error al crear usuario",
    };
  }
}

function getUsuarios() { }
function getPuestos() {
  return new Promise((resolve, reject) => {
    connection.query(
      "SELECT puestoId, nombre_puesto FROM puesto ORDER BY puestoId",
      (error, results) => {
        if (error) {
          console.error("Error al obtener puestos:", error);
          reject(error);
        } else {
          resolve(results);
        }
      },
    );
  });
}
function getRoles() {
  return new Promise((resolve, reject) => {
    connection.query(
      "SELECT rolId, nombre_rol FROM roles ORDER BY rolId",
      (error, results) => {
        if (error) {
          console.error("Error al obtener roles:", error);
          reject(error);
        } else {
          resolve(results);
        }
      },
    );
  });
}
function getTipos() {
  return new Promise((resolve, reject) => {
    connection.query(
      "SELECT tipoId, nombre_tipo FROM tipos ORDER BY tipoId",
      (error, results) => {
        if (error) {
          console.error("Error al obtener los tipos de puesto:", error);
          reject(error);
        } else {
          resolve(results);
        }
      },
    );
  });
}
function getSueldos() {
  return new Promise((resolve, reject) => {
    connection.query(
      "SELECT sueldoId, cantidad_sueldo FROM sueldos ORDER BY sueldoId",
      (error, results) => {
        if (error) {
          console.error("Error al obtener los sueldos:", error);
          reject(error);
        } else {
          resolve(results);
        }
      },
    );
  });
}
function getDiasVacaciones() {
  return new Promise((resolve, reject) => {
    connection.query(
      "SELECT dias_vacacionesId, dias FROM diasVacaciones ORDER BY dias_vacacionesId",
      (error, results) => {
        if (error) {
          console.error("Error al obtener los dias de vacaciones:", error);
          reject(error);
        } else {
          resolve(results);
        }
      },
    );
  });
}
function getPeriodosDeEvaluacion() {
  return new Promise((resolve, reject) => {
    connection.query(
      "SELECT periodo_evaluacionesId, periodo FROM periodoevaluaciones ORDER BY periodo_evaluacionesId",
      (error, results) => {
        if (error) {
          console.error("Error al obtener los periodos de evaluacion:", error);
          reject(error);
        } else {
          resolve(results);
        }
      },
    );
  });
}
const jwt = require("jsonwebtoken");

/**
 * Busca al usuario en la BD, valida su contraseña con bcrypt
 * y devuelve un JWT firmado si las credenciales son correctas.
 * @param {string} usuario     - Nombre de usuario.
 * @param {string} contrasenia - Contraseña en texto plano.
 * @returns {Object} { success, message, token?, usuario? }
 */
async function loginUser(usuario, contrasenia) {
  const query = (sql, values) => {
    return new Promise((resolve, reject) => {
      connection.query(sql, values, (error, results) => {
        if (error) reject(error);
        else resolve(results);
      });
    });
  };

  try {
    // 1. Buscar el usuario en la BD
    const rows = await query("SELECT * FROM usuarios WHERE usuario = ?", [
      usuario,
    ]);

    if (rows.length === 0) {
      return { success: false, message: "Credenciales incorrectas" };
    }

    const user = rows[0];

    // 2. Comparar contraseña con el hash
    const passwordMatch = await bcrypt.compare(contrasenia, user.contrasenia);
    if (!passwordMatch) {
      return { success: false, message: "Credenciales incorrectas" };
    }

    // 3. Generar JWT
    const token = jwt.sign(
      {
        usuarioId: user.usuarioId,
        usuario: user.usuario,
        rolId: user.rolId,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
    );

    return {
      success: true,
      message: "Login exitoso",
      token,
      usuario: {
        usuarioId: user.usuarioId,
        nombre: user.nombre,
        usuario: user.usuario,
        rolId: user.rolId,
      },
    };
  } catch (error) {
    console.error("Error en loginUser:", error);
    return {
      success: false,
      message: error.message || "Error al iniciar sesión",
    };
  }
};
/**
 * Genera un nombre de usuario automático basado en el nombre completo.
 * Formato: primera letra del nombre + apellido paterno + 2 primeras letras del apellido materno
 * Todo en minúsculas, sin acentos ni caracteres especiales.
 * Si el usuario ya existe, agrega un número al final.
 *
 * @param {string} nombre    - Primer nombre del empleado
 * @param {string} apPaterno - Apellido paterno
 * @param {string} apMaterno - Apellido materno
 * @returns {string} Usuario generado único
 */
async function generarUsuario(nombre, apPaterno, apMaterno) {
  // Eliminar acentos y caracteres especiales
  const limpiar = (str) =>
    str.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // quita acentos
      .replace(/[^a-zA-Z]/g, '')       // quita todo excepto letras
      .toLowerCase();
  const primeraNombre = limpiar(nombre)[0] || '';
  const paterno = limpiar(apPaterno) || '';
  const dosMaterno = limpiar(apMaterno).slice(0, 2) || '';
  const baseUsuario = `${primeraNombre}${paterno}${dosMaterno}`;
  // Verificar si ya existe, si sí agregar número
  const query = (sql, values) => new Promise((resolve, reject) => {
    connection.query(sql, values, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
  let usuario = baseUsuario;
  let contador = 1;
  while (true) {
    const existe = await query(
      'SELECT usuarioId FROM usuarios WHERE usuario = ?',
      [usuario]
    );
    if (existe.length === 0) break; // usuario disponible
    usuario = `${baseUsuario}${contador}`;
    contador++;
  }
  return usuario;
}
function getDepartamentos() {
    return new Promise((resolve, reject) => {
        connection.query(
            'SELECT departamentoId, nombre FROM departamentos ORDER BY nombre',
            (error, results) => {
                if (error) reject(error);
                else resolve(results);
            }
        );
    });
}
module.exports = {
  createUser,
  loginUser,
  generarUsuario,
  getPuestos,
  getRoles,
  getDiasVacaciones,
  getPeriodosDeEvaluacion,
  getTipos,
  getSueldos,
  getDepartamentos
};
