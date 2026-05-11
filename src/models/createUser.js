const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const connection = require("../config/connection");

async function createUser(userData) {
    const query = (sql, values) => new Promise((resolve, reject) => {
        connection.query(sql, values, (error, results) => {
            if (error) reject(error);
            else resolve(results);
        });
    });

    try {
        const rolExits = await query("SELECT * FROM roles WHERE rolId = ?", [userData.rolId]);
        if (rolExits.length === 0) throw new Error("El rol no existe");

        const puestoExits = await query("SELECT * FROM puesto WHERE puestoId = ?", [userData.puestoId]);
        if (puestoExits.length === 0) throw new Error("El puesto no existe");

        const existingUser = await query("SELECT * FROM usuarios WHERE usuario = ?", [userData.usuario]);
        if (existingUser.length > 0) throw new Error("El usuario ya existe");

        const hashedPassword = await bcrypt.hash(userData.contrasenia, 10);
        //Validacion de cambios numericos.
        const camposNumericos = [
            'sueldo',
            'sueldo_bruto',
            'sueldo_neto',
            'fondo_ahorro'
        ];
        for (const campo of camposNumericos) {
            if (userData[campo] !== undefined && userData[campo] !== null && userData[campo] !== '') {
                const numero = Number(userData[campo]);
                if (isNaN(numero)) {
                    return {
                        success: false,
                        message: `${campo} inválido`
                    };
                }
                userData[campo] = numero;
            }
        }
        //RFC Y CURP tranformado a mayusculas
        if (userData?.RFC) {
            userData.RFC = userData.RFC.toUpperCase().trim();
        }
        if (userData?.curp) {
            userData.curp = userData.curp.toUpperCase().trim();
        }
        //Validacion Clabe Interbancaria
        if (datosNuevos.clabe_interbancaria) {
            const clabe = datosNuevos.clabe_interbancaria.replace(/\s/g, '');
            if (!/^\d{18}$/.test(clabe)) {
                return {
                    success: false,
                    message: 'CLABE inválida'
                };
            }
            datosNuevos.clabe_interbancaria = clabe;
        }
        //Validacion NSS
        if (datosNuevos.numero_seguro_social) {
            const nss = datosNuevos.numero_seguro_social.replace(/\s/g, '');
            if (!/^\d{11}$/.test(nss)) {
                return {
                    success: false,
                    message: 'NSS inválido'
                };
            }
            datosNuevos.numero_seguro_social = nss;
        }
        //Validacion numero de telefono
        if (datosNuevos.celular) {
            const celular = datosNuevos.celular.replace(/\D/g, '');
            if (celular.length !== 10) {
                return {
                    success: false,
                    message: 'Celular inválido'
                };
            }
            datosNuevos.celular = celular;
        }
        // Calcular sueldo desglosado
        const sueldoBruto = userData.sueldo_bruto ? Number(userData.sueldo_bruto) : (userData.sueldo ? Number(userData.sueldo) : null);
        const fondoAhorro = sueldoBruto ? Math.round(sueldoBruto * 0.05 * 100) / 100 : null;
        const sueldoNeto = sueldoBruto ? Math.round(sueldoBruto * 0.95 * 100) / 100 : null;

        const result = await query(`
            INSERT INTO usuarios (
                nombre, apPaterno, apMaterno, usuario, contrasenia,
                puestoId, tipoId, rolId,
                fechaContratacion, departamento, jefe_inmediato,
                sueldo, sueldo_bruto, fondo_ahorro, sueldo_neto,
                genero, estado_civil, numero_seguro_social, RFC,
                fecha_nacimiento, curp, celular, es_padre_madre,
                fecha_contrato_indeterminado_3m,
                talla_playera, talla_pantalon, talla_calzado, talla_faja, talla_guantes,
                numero_cuenta, clabe_interbancaria, codigo_postal, infonavit, fonacot,
                emergencia_nombre, emergencia_telefono, emergencia_parentesco,
                domicilio_calle, domicilio_colonia, domicilio_localidad,
                domicilio_cp, domicilio_num_ext, domicilio_num_int,
                domicilio_municipio, domicilio_estado, razon_social, nombre_banco, codigo_postal_fiscal
            ) VALUES (
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?,
                ?, ?,?,?,?
            )
        `, [
            userData.nombre, userData.apPaterno, userData.apMaterno,
            userData.usuario, hashedPassword,
            userData.puestoId, userData.tipoId || null, userData.rolId,
            userData.fechaContratacion, userData.departamento, userData.jefe_inmediato || null,
            sueldoBruto, sueldoBruto, fondoAhorro, sueldoNeto,
            userData.genero || null, userData.estado_civil || null,
            userData.numero_seguro_social || null, userData.RFC || null,
            userData.fecha_nacimiento || null, userData.curp || null,
            userData.celular || null, userData.es_padre_madre || null,
            userData.fecha_contrato_indeterminado_3m || null,
            userData.talla_playera || null, userData.talla_pantalon || null,
            userData.talla_calzado || null, userData.talla_faja || null, userData.talla_guantes || null,
            userData.numero_cuenta || null, userData.clabe_interbancaria || null,
            userData.codigo_postal || null, userData.infonavit || null, userData.fonacot || null,
            userData.emergencia_nombre || null, userData.emergencia_telefono || null,
            userData.emergencia_parentesco || null,
            userData.domicilio_calle || null, userData.domicilio_colonia || null,
            userData.domicilio_localidad || null,
            userData.domicilio_cp || null, userData.domicilio_num_ext || null,
            userData.domicilio_num_int || null,
            userData.domicilio_municipio || null, userData.domicilio_estado || null,
            userData.razon_social || null,
            userData.nombre_banco || null,
            userData.codigo_postal_fiscal || null,
        ]);

        return {
            success: true,
            message: "Usuario creado exitosamente",
            usuarioId: result.insertId,
            usuario: userData.usuario,
            rolId: userData.rolId,
        };
    } catch (error) {
        console.error("Error al crear usuario:", error);
        return { success: false, message: error.message || "Error al crear usuario" };
    }
}

async function loginUser(usuario, contrasenia) {
    const query = (sql, values) => new Promise((resolve, reject) => {
        connection.query(sql, values, (error, results) => {
            if (error) reject(error);
            else resolve(results);
        });
    });

    try {
        const rows = await query("SELECT * FROM usuarios WHERE usuario = ?", [usuario]);
        if (rows.length === 0) return { success: false, message: "Credenciales incorrectas" };

        const user = rows[0];
        const passwordMatch = await bcrypt.compare(contrasenia, user.contrasenia);
        if (!passwordMatch) return { success: false, message: "Credenciales incorrectas" };

        const token = jwt.sign(
            {
                usuarioId: user.usuarioId,
                usuario: user.usuario,
                rolId: user.rolId,
                departamento: user.departamento || null,
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
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
                departamento: user.departamento || null,
            },
        };
    } catch (error) {
        console.error("Error en loginUser:", error);
        return { success: false, message: error.message || "Error al iniciar sesión" };
    }
}

async function generarUsuario(nombre, apPaterno, apMaterno) {
    const limpiar = (str) =>
        str.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z]/g, '')
            .toLowerCase();

    const baseUsuario = `${limpiar(nombre)[0] || ''}${limpiar(apPaterno)}${limpiar(apMaterno).slice(0, 2)}`;

    const query = (sql, values) => new Promise((resolve, reject) => {
        connection.query(sql, values, (error, results) => {
            if (error) reject(error);
            else resolve(results);
        });
    });

    let usuario = baseUsuario;
    let contador = 1;
    while (true) {
        const existe = await query('SELECT usuarioId FROM usuarios WHERE usuario = ?', [usuario]);
        if (existe.length === 0) break;
        usuario = `${baseUsuario}${contador}`;
        contador++;
    }
    return usuario;
}

function getPuestos() {
    return new Promise((resolve, reject) => {
        connection.query("SELECT puestoId, nombre_puesto FROM puesto ORDER BY puestoId",
            (error, results) => error ? reject(error) : resolve(results));
    });
}

function getRoles() {
    return new Promise((resolve, reject) => {
        connection.query("SELECT rolId, nombre_rol FROM roles ORDER BY rolId",
            (error, results) => error ? reject(error) : resolve(results));
    });
}

function getTipos() {
    return new Promise((resolve, reject) => {
        connection.query("SELECT tipoId, nombre_tipo FROM tipos ORDER BY tipoId",
            (error, results) => error ? reject(error) : resolve(results));
    });
}

function getSueldos() {
    return new Promise((resolve, reject) => {
        connection.query("SELECT sueldoId, cantidad_sueldo FROM sueldos ORDER BY sueldoId",
            (error, results) => error ? reject(error) : resolve(results));
    });
}

function getDiasVacaciones() {
    return new Promise((resolve, reject) => {
        connection.query("SELECT dias_vacacionesId, dias FROM diasvacaciones ORDER BY dias_vacacionesId",
            (error, results) => error ? reject(error) : resolve(results));
    });
}

function getPeriodosDeEvaluacion() {
    return new Promise((resolve, reject) => {
        connection.query("SELECT periodo_evaluacionesId, periodo FROM periodoevaluaciones ORDER BY periodo_evaluacionesId",
            (error, results) => error ? reject(error) : resolve(results));
    });
}

function getDepartamentos() {
    return new Promise((resolve, reject) => {
        connection.query("SELECT departamentoId, nombre FROM departamentos ORDER BY nombre",
            (error, results) => error ? reject(error) : resolve(results));
    });
}

module.exports = {
    createUser, loginUser, generarUsuario,
    getPuestos, getRoles, getTipos, getSueldos,
    getDiasVacaciones, getPeriodosDeEvaluacion, getDepartamentos,
};