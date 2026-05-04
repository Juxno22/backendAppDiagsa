const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const connection = require("../config/connection");
const { authMiddleware, soloSupervisor } = require("../middlewares/auth");
const { upload, subirImagen } = require("../config/cloudinary");
const { generarWordEvaluacion } = require("../models/generarWordEvaluacion");
const { generarWordPermiso } = require('../models/generarWordPermiso');
const {
    crearPermiso, getPermisosByEmpleado, getTodosPermisos,
    getPermisoById, responderPermiso, deletePermiso,
} = require('../models/permisos');
const {
    generarNotificaciones,
    getNotificacionesRH,
    marcarComoLeida,
    contarNoLeidas,
} = require("../models/notificacionesRH");
const {
    getAllPlantillas,
    getPlantillaById,
    createPlantilla,
    updatePlantilla,
    deletePlantilla,
    getAllSecciones,
    createSeccion,
    updateSeccion,
    deleteSeccion,
    getPreguntasBySeccion,
    createPregunta,
    updatePregunta,
    deletePregunta,
} = require("../models/evaluacionesCrud");
const {
    createUser,
    loginUser,
    getPuestos,
    getRoles,
    getDiasVacaciones,
    getPeriodosDeEvaluacion,
    getTipos,
    getSueldos,
    generarUsuario,
    getDepartamentos,
} = require("../models/createUser");
const {
    getEmpleadoById,
    getVacacionesByEmpleado,
    solicitarVacaciones,
    getAllEmpleados,
    updateEmpleado,
    createEvaluacion,
    getEvaluacionesByEmpleado,
    responderVacaciones,
    getVacacionesPendientes,
    getNotificacionesByEmpleado,
    getDiasVacacionesLFT,
    deleteEmpleado,
    getTodasVacaciones,
} = require("../models/empleado");
const {
    getSecciones,
    getSeccionesSimple,
    createEvaluacionCompleta,
    getEvaluacionesByEmpleado: getEvaluacionesCompletas,
    getEvaluacionById,
    getAllEvaluaciones,
} = require("../models/evaluaciones");
const { generarExcelVacaciones } = require("../models/generarExcelVacaciones");
// POST /api/rh/empleados/:id/foto
router.post(
    "/rh/empleados/:id/foto",
    authMiddleware,
    upload.single("foto"),
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "No se proporcionó ninguna imagen",
                });
            }

            // Subir a Cloudinary con el ID del usuario como nombre
            const url = await subirImagen(
                req.file.buffer,
                "diagsa_empleados",
                `empleado_${id}`,
            );

            // Guardar URL en la BD
            await new Promise((resolve, reject) => {
                connection.query(
                    "UPDATE usuarios SET foto = ? WHERE usuarioId = ?",
                    [url, id],
                    (err) => (err ? reject(err) : resolve(null)),
                );
            });

            res.json({ success: true, data: { foto: url } });
        } catch (error) {
            console.error("Error al subir foto:", error);
            res.status(500).json({ success: false, message: error.message });
        }
    },
);
// Rutas de catálogos sin prefijo (para compatibilidad con el frontend web)
router.get("/roles", async (req, res) => {
    try {
        const roles = await getRoles();
        res.json({ success: true, data: roles });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/puestos", async (req, res) => {
    try {
        const puestos = await getPuestos();
        res.json({ success: true, data: puestos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/tipos", async (req, res) => {
    try {
        const tipos = await getTipos();
        res.json({ success: true, data: tipos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/sueldos", async (req, res) => {
    try {
        const sueldos = await getSueldos();
        res.json({ success: true, data: sueldos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/diasvacaciones", async (req, res) => {
    try {
        const dias = await getDiasVacaciones();
        res.json({ success: true, data: dias });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/periodosevaluacion", async (req, res) => {
    try {
        const periodos = await getPeriodosDeEvaluacion();
        res.json({ success: true, data: periodos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/evaluaciones/secciones", authMiddleware, async (req, res) => {
    try {
        const secciones = await getSecciones();
        res.json({ success: true, data: secciones });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/login
 * Recibe usuario y contraseña, devuelve JWT si son correctos.
 * Body: { usuario, contrasenia }
 */
router.post("/login", async (req, res) => {
    try {
        const { usuario, contrasenia } = req.body;

        if (!usuario || !contrasenia) {
            return res.status(400).json({
                success: false,
                message: "usuario y contrasenia son requeridos",
            });
        }

        const result = await loginUser(usuario, contrasenia);
        const statusCode = result.success ? 200 : 401;
        res.status(statusCode).json(result);
    } catch (error) {
        console.error("Error en /login:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error interno",
        });
    }
});
router.get("/empleados/puestos", authMiddleware, async (req, res) => {
    try {
        const puestos = await getPuestos();
        res.json({
            success: true,
            data: puestos,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Error al obtener los puestos",
        });
    }
});

router.get("/empleados/roles", authMiddleware, async (req, res) => {
    try {
        const roles = await getRoles();
        res.json({
            success: true,
            data: roles,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Error al obtener los roles",
        });
    }
});

router.get("/empleados/tipos", authMiddleware, async (req, res) => {
    try {
        const tipos = await getTipos();
        res.json({
            success: true,
            data: tipos,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Error al obtener los tipos de puesto",
        });
    }
});

router.get("/empleados/diasvacaciones", authMiddleware, async (req, res) => {
    try {
        const diasvacaciones = await getDiasVacaciones();
        res.json({
            success: true,
            data: diasvacaciones,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Error al obtener los dias de vacaciones",
        });
    }
});

router.get(
    "/empleados/periodosevaluacion",
    authMiddleware,
    async (req, res) => {
        try {
            const periodosDeEvaluacion = await getPeriodosDeEvaluacion();
            res.json({
                success: true,
                data: periodosDeEvaluacion,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message || "Error al obtener los periodos de evaluacion",
            });
        }
    },
);

router.get("/empleados/sueldos", authMiddleware, async (req, res) => {
    try {
        const sueldos = await getSueldos();
        res.json({
            success: true,
            data: sueldos,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Error al obtener los sueldos",
        });
    }
});
//crear nuevo usuario
router.post("/createuser", authMiddleware, async (req, res) => {
    try {
        //validar que todos los campos necesarios estén presentes
        const requiredFields = [
            "nombre",
            "apPaterno",
            "apMaterno",
            "usuario",
            "contrasenia",
            "puestoId",
            "rolId",
            "fechaContratacion",
            "departamento",
        ];
        const missingFields = requiredFields.filter((field) => !req.body[field]);
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Faltan campos requeridos: ${missingFields.join(", ")}`,
            });
        }
        const idFields = ["puestoId", "rolId"];
        for (const field of idFields) {
            if (isNaN(req.body[field])) {
                return res.status(400).json({
                    success: false,
                    message: `El campo ${field} debe ser un número válido`,
                });
            }
        }
        //crear nuevo usuario
        const result = await createUser(req.body);
        if (result.success) {
            await generarNotificaciones(result.usuarioId);
            res.status(200).json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (eror) {
        console.error("Error en la ruta", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error al crear el usuario",
        });
    }
});

router.get("/empleados/health", (req, res) => {
    res.json({
        success: true,
        message: "API funcionando correctamente",
        timestamp: new Date().toISOString(),
    });
});
/**
 * GET /api/empleados/mi-perfil
 * El empleado consulta su propia información.
 * Requiere: token de sesión → req.user.usuarioId
 */
router.get("/empleados/mi-perfil", authMiddleware, async (req, res) => {
    try {
        const usuarioId = req.user.usuarioId; // ← solo del token
        const empleado = await getEmpleadoById(usuarioId);
        if (!empleado) {
            return res
                .status(404)
                .json({ success: false, message: "Empleado no encontrado" });
        }
        res.json({ success: true, data: empleado });
    } catch (error) {
        res
            .status(500)
            .json({ success: false, message: error.message || "Error interno" });
    }
});
/**
 * GET /api/empleados/mis-vacaciones
 * El empleado consulta el historial de sus solicitudes de vacaciones.
 */
router.get("/empleados/mis-vacaciones", authMiddleware, async (req, res) => {
    try {
        const usuarioId = req.user.usuarioId; // ← solo del token
        const vacaciones = await getVacacionesByEmpleado(usuarioId);
        res.json({ success: true, data: vacaciones });
    } catch (error) {
        res
            .status(500)
            .json({ success: false, message: error.message || "Error interno" });
    }
});
/**
 * POST /api/empleados/solicitar-vacaciones
 * El empleado crea una nueva solicitud de vacaciones.
 * Body esperado: { usuarioId, fechaInicio, fechaFin, dias_vacacionesId }
 */
router.post(
    "/empleados/solicitar-vacaciones",
    authMiddleware,
    async (req, res) => {
        try {
            const { fechaInicio, fechaFin, dias_vacacionesId } = req.body;
            const usuarioId = req.user.usuarioId;
            const rolSolicitante = req.user.rolId;

            if (!fechaInicio || !fechaFin || !dias_vacacionesId) {
                return res
                    .status(400)
                    .json({ success: false, message: "Faltan campos requeridos" });
            }

            const result = await solicitarVacaciones(
                usuarioId,
                fechaInicio,
                fechaFin,
                dias_vacacionesId,
            );

            if (!result.success) return res.status(400).json(result);

            // ── RH: aprobar automáticamente sin autorización ──
            if (rolSolicitante === 3) {
                await new Promise((resolve, reject) => {
                    connection.query(
                        `UPDATE vacaciones SET 
                        estado_final = 'Aceptadas',
                        respuesta_jefe_inmediato = 'Aceptadas',
                        respuesta_RH = 'Aceptadas'
                     WHERE vacacionesId = ?`,
                        [result.vacacionesId],
                        (err) => (err ? reject(err) : resolve(null)),
                    );
                });
                return res.json({
                    success: true,
                    message: "Vacaciones aprobadas automáticamente",
                    vacacionesId: result.vacacionesId,
                });
            }

            // ── Supervisor: requiere solo autorización de RH ──
            if (rolSolicitante === 2) {
                await new Promise((resolve, reject) => {
                    connection.query(
                        `UPDATE vacaciones SET 
                        respuesta_jefe_inmediato = 'Aceptadas'
                     WHERE vacacionesId = ?`,
                        [result.vacacionesId],
                        (err) => (err ? reject(err) : resolve(null)),
                    );
                });
                return res.json({
                    success: true,
                    message: "Solicitud enviada. Pendiente de autorización de RH",
                    vacacionesId: result.vacacionesId,
                });
            }

            res.status(result.success ? 200 : 400).json(result);
        } catch (error) {
            res
                .status(500)
                .json({ success: false, message: error.message || "Error interno" });
        }
    },
);
/**
 * GET /api/supervisor/empleados
 * El supervisor obtiene la lista de todos los empleados.
 */
router.get("/supervisor/empleados", authMiddleware, async (req, res) => {
    try {
        const empleados = await getAllEmpleados();
        res.json({
            success: true,
            data: empleados,
        });
    } catch (error) {
        console.error("Error al obtener empleados", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error interno",
        });
    }
});
/**
 * GET /api/supervisor/empleados/:id
 * El supervisor consulta el perfil completo de un empleado específico.
 */
router.get("/supervisor/empleados/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: "ID incorrecto",
            });
        }
        const empleado = await getEmpleadoById(id);
        if (!empleado) {
            return res.status(404).json({
                success: false,
                message: "Empleado no encontrado",
            });
        }
        res.json({
            success: true,
            data: empleado,
        });
    } catch (error) {
        console.error("Error al obtener al empleado", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error interno",
        });
    }
});
/**
 * PATCH /api/supervisor/empleados/:id
 * El supervisor actualiza parcialmente la información de un empleado.
 * Body: cualquier subconjunto de { nombre, apPaterno, apMaterno, puestoId,
 *        tipoId, sueldoId, rolId, fechaContratacion, departamento, jefe_inmediato }
 */
router.patch("/supervisor/empleados/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: "ID incorrecto",
            });
        }
        if (Object.keys(req.body).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No se enviaron datos para actualizar",
            });
        }
        const result = await updateEmpleado(id, req.body);
        const statusCode = result.success ? 200 : 400;
        res.status(statusCode).json(result);
    } catch (error) {
        console.error("Error al actualizar empleado:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error interno",
        });
    }
});
/**
 * POST /api/supervisor/evaluaciones
 * El supervisor registra una nueva evaluación para un empleado.
 * Body: { usuarioId, fecha_evaluacion, periodo_evaluacionesId, promedio_final,
 *         recontratacion, comentario_final, ...comentarios opcionales }
 */
router.post("/supervisor/evaluaciones", authMiddleware, async (req, res) => {
    try {
        //validar los campos obligatorios de las evaluaciones
        const camposRequeridos = [
            "usuarioId",
            "fecha_evaluacion",
            "periodo_evaluacionesId",
            "promedio_final",
            "recontratacion",
            "comentario_final",
        ];
        const faltantes = camposRequeridos.filter(
            (c) => req.body[c] === undefined || req.body[c] === "",
        );
        if (faltantes.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Faltan campos requeridos",
            });
        }
        //validar que recontratacion sea un valor ENUM
        if (!["Si", "No"].includes(req.body.recontratacion)) {
            return res.status(400).json({
                success: false,
                message: "Recontratacion no tiene un valor valido",
            });
        }
        const result = await createEvaluacion(req.body);
        const statusCode = result.success ? 201 : 400;
        res.status(statusCode).json(result);
    } catch (error) {
        console.error("Error al crear la evaluacion", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error interno",
        });
    }
});
/**
 * GET /api/supervisor/evaluaciones/:usuarioId
 * El supervisor consulta el historial de evaluaciones de un empleado.
 */
router.get(
    "/supervisor/evaluaciones/:usuarioId",
    authMiddleware,
    async (req, res) => {
        try {
            const { usuarioId } = req.params;
            if (isNaN(usuarioId)) {
                return res.status(400).json({
                    success: "Error en el Id",
                });
            }
            const evaluaciones = await getEvaluacionesByEmpleado(usuarioId);
            res.json({
                success: true,
                data: evaluaciones,
            });
        } catch (error) {
            console.error("Error al obtener las evaluaciones", error);
            res.status(500).json({
                success: false,
                message: error.message || "Error interno",
            });
        }
    },
);
/**
 * GET /api/supervisor/vacaciones/pendientes
 * El supervisor/RH ve todas las solicitudes de vacaciones sin respuesta.
 */
router.get(
    "/supervisor/vacaciones/pendientes",
    authMiddleware,
    async (req, res) => {
        try {
            const pendientes = await getVacacionesPendientes();
            res.json({
                success: true,
                data: pendientes,
            });
        } catch (error) {
            console.error("Error al mostrar las vacaciones pendientes", error);
            res.status(500).json({
                success: false,
                message: error.message || "Error interno",
            });
        }
    },
);
/**
 * PATCH /api/supervisor/vacaciones/:id/responder
 * El supervisor (jefe o RH) acepta o deniega una solicitud de vacaciones.
 * Body: { respuesta: 'Aceptadas' | 'Denegadas', rol: 'jefe' | 'rh' }
 */
router.patch(
    "/supervisor/vacaciones/:id/responder",
    authMiddleware,
    async (req, res) => {
        console.log("Body recibido:", req.body); // ← agrega esta línea
        console.log("Params:", req.params); // ← y esta
        try {
            const { id } = req.params;
            const { respuesta, rol } = req.body;
            if (isNaN(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Id erroneo",
                });
            }
            if (!respuesta || !rol) {
                return res.status(400).json({
                    success: false,
                    message: "CCampos faltantes",
                });
            }
            if (!["Aceptadas", "Denegadas"].includes(respuesta)) {
                return res.status(400).json({
                    success: false,
                    message: "respuestas erroneas",
                });
            }
            const result = await responderVacaciones(id, respuesta, rol);
            const statusCode = result.success ? 200 : 400;
            res.status(statusCode).json(result);
        } catch (error) {
            console.error("Error al responder vacaciones", error);
            res.status(400).json({
                success: false,
                message: error.message || "Error interno",
            });
        }
    },
);
/**
 * GET /api/empleados/notificaciones
 * El empleado obtiene sus notificaciones (vacaciones + evaluaciones).
 */
router.get("/empleados/notificaciones", authMiddleware, async (req, res) => {
    try {
        const usuarioId = req.user.usuarioId;
        const notificaciones = await getNotificacionesByEmpleado(usuarioId);
        res.json({ success: true, data: notificaciones });
    } catch (error) {
        console.error("Error al obtener notificaciones:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error interno",
        });
    }
});
router.get("/evaluaciones-secciones", authMiddleware, async (req, res) => {
    try {
        const secciones = await getSecciones();
        res.json({
            success: true,
            data: secciones,
        });
    } catch (error) {
        console.error("Error al obtener las secciones", error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
router.get("/evaluaciones", authMiddleware, async (req, res) => {
    try {
        console.log("Body recibido:", JSON.stringify(req.body, null, 2));
        console.log("Usuario:", req.user);
        const evaluaciones = await getAllEvaluaciones();
        res.json({
            success: true,
            data: evaluaciones,
        });
    } catch (error) {
        console.error("Error al obtener las evaluaciones", error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
router.get("/evaluaciones/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: "Id invalido",
            });
        }
        const evaluacion = await getEvaluacionById(id);
        if (!evaluacion) {
            return res.status(400).json({
                success: false,
                message: "Evaluacion no encontrada",
            });
        }
        res.json({
            success: true,
            data: evaluacion,
        });
    } catch (error) {
        console.error("Error al obtener evaluacion", error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
router.get(
    "/evaluaciones/empleado/:usuarioId",
    authMiddleware,
    async (req, res) => {
        try {
            const { usuarioId } = req.params;
            if (isNaN(usuarioId)) {
                return res.status(400).json({
                    success: false,
                    message: "Id invalido",
                });
            }
            const evaluacion = await getEvaluacionesCompletas(usuarioId);
            res.json({
                success: true,
                data: evaluacion,
            });
        } catch (error) {
            console.error("Error al obtener evaluacion del empleado", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },
);
router.post("/evaluaciones", authMiddleware, async (req, res) => {
    try {
        //campos obligatorios
        const camposRequeridos = [
            "usuarioId",
            "fecha_evaluacion",
            "periodo_evaluacionesId",
            "promedio_final",
            "recontratacion",
            "comentario_final",
            "respuestas",
        ];
        const faltantes = camposRequeridos.filter(
            (c) => req.body[c] === undefined || req.body[c] === "",
        );
        if (faltantes.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Faltan campos requeridos: ${faltantes.join(", ")}`,
            });
        }
        //validar recontratacion
        if (!["Si", "No"].includes(req.body.recontratacion)) {
            return res.status(400).json({
                success: false,
                message: 'Recontratacion debe ser "Si" o  "No" ',
            });
        }
        //validar que respuesta sea un array con elementos
        if (
            !Array.isArray(req.body.respuestas) ||
            req.body.respuestas.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
        //validar puntuuacion 1-5
        const puntuacionInvalida = req.body.respuestas.find(
            (r) =>
                !r.preguntaId || !r.puntuacion || r.puntuacion < 1 || r.puntuacion > 5,
        );
        if (puntuacionInvalida) {
            return res.status(400).json({
                success: false,
                message: "Puntuacion invalida",
            });
        }
        //el evaluador esta autenticado
        const evalData = {
            ...req.body,
            evaluador_id: req.user.usuarioId,
        };
        const result = await createEvaluacionCompleta(evalData);
        const statusCode = result.success ? 201 : 400;
        res.status(statusCode).json(result);
    } catch (error) {
        console.error("Error al crear evaluacion", error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});
/**
 * GET /api/empleados/mis-dias-vacaciones
 * Devuelve los días de vacaciones que le corresponden
 * al empleado según su antigüedad (LFT).
 */
router.get(
    "/empleados/mis-dias-vacaciones",
    authMiddleware,
    async (req, res) => {
        try {
            const usuarioId = req.user.usuarioId;
            const resultado = await getDiasVacacionesLFT(usuarioId);

            if (!resultado) {
                return res.status(404).json({
                    success: false,
                    message: "Empleado no encontrado",
                });
            }
            if (resultado.dias === 0) {
                return res.json({
                    success: true,
                    data: resultado,
                    message: "Aún no tienes derecho a vacaciones (menos de 1 año)",
                });
            }
            res.json({ success: true, data: resultado });
        } catch (error) {
            console.error("Error al obtener días de vacaciones LFT:", error);
            res.status(500).json({ success: false, message: error.message });
        }
    },
);
/**
 * POST /api/generar-usuario
 * Genera un nombre de usuario automático basado en el nombre completo.
 * Body: { nombre, apPaterno, apMaterno }
 */
router.post("/generar-usuario", async (req, res) => {
    try {
        const { nombre, apPaterno, apMaterno } = req.body;
        if (!nombre || !apPaterno || !apMaterno) {
            return res.status(400).json({
                success: false,
                message: "nombre, apPaterno y apMaterno son requeridos",
            });
        }
        const usuario = await generarUsuario(nombre, apPaterno, apMaterno);
        res.json({ success: true, data: { usuario } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * DELETE /api/rh/empleados/:id
 * Elimina un empleado. Requiere verificar la contraseña del RH.
 * Body: { contrasenia }
 */
router.delete("/rh/empleados/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { contrasenia } = req.body;
        const rhId = req.user.usuarioId;
        const rolSolicitante = req.user.rolId;

        if (!contrasenia) {
            return res.status(400).json({
                success: false,
                message: "Se requiere tu contraseña para confirmar",
            });
        }

        // Verificar contraseña del RH
        const rows = await new Promise((resolve, reject) => {
            connection.query(
                "SELECT contrasenia FROM usuarios WHERE usuarioId = ?",
                [rhId],
                (err, results) => (err ? reject(err) : resolve(results)),
            );
        });

        if (rows.length === 0) {
            return res
                .status(401)
                .json({ success: false, message: "Usuario no encontrado" });
        }

        const passwordMatch = await bcrypt.compare(
            contrasenia,
            rows[0].contrasenia,
        );
        if (!passwordMatch) {
            return res
                .status(401)
                .json({ success: false, message: "Contraseña incorrecta" });
        }

        const result = await deleteEmpleado(Number(id), rolSolicitante);
        const statusCode = result.success ? 200 : 400;
        res.status(statusCode).json(result);
    } catch (error) {
        console.error("Error al eliminar empleado:", error);
        res
            .status(500)
            .json({ success: false, message: error.message || "Error interno" });
    }
});
/**
 * GET /api/rh/secciones
 * Lista todas las secciones con sus preguntas.
 * Acceso: RH
 */
router.get("/rh/secciones", authMiddleware, async (req, res) => {
    try {
        const secciones = await getAllSecciones();
        res.json({ success: true, data: secciones });
    } catch (error) {
        console.error("Error al obtener secciones:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * POST /api/rh/secciones
 * Crea una nueva sección. Máximo 5.
 * Body: { nombre }
 */
router.post("/rh/secciones", authMiddleware, async (req, res) => {
    try {
        const { nombre } = req.body;
        if (!nombre?.trim()) {
            return res.status(400).json({
                success: false,
                message: "El nombre de la sección es requerido",
            });
        }
        const result = await createSeccion(nombre.trim());
        res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
        console.error("Error al crear sección:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * PATCH /api/rh/secciones/:id
 * Actualiza el nombre de una sección.
 * Body: { nombre }
 */
router.patch("/rh/secciones/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre } = req.body;
        if (!nombre?.trim()) {
            return res.status(400).json({
                success: false,
                message: "El nombre de la sección es requerido",
            });
        }
        const result = await updateSeccion(Number(id), nombre.trim());
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error("Error al actualizar sección:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * DELETE /api/rh/secciones/:id
 * Elimina una sección y sus preguntas.
 * No se puede eliminar si tiene evaluaciones registradas.
 */
router.delete("/rh/secciones/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await deleteSeccion(Number(id));
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error("Error al eliminar sección:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/** Preguntas
 * GET /api/rh/secciones/:id/preguntas
 * Lista las preguntas de una sección.
 */
router.get("/rh/secciones/:id/preguntas", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const preguntas = await getPreguntasBySeccion(Number(id));
        res.json({ success: true, data: preguntas });
    } catch (error) {
        console.error("Error al obtener preguntas:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * POST /api/rh/secciones/:id/preguntas
 * Crea una pregunta en una sección. Máximo 5 por sección.
 * Body: { pregunta }
 */
router.post("/rh/secciones/:id/preguntas", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { pregunta } = req.body;
        if (!pregunta?.trim()) {
            return res.status(400).json({
                success: false,
                message: "El texto de la pregunta es requerido",
            });
        }
        const result = await createPregunta(Number(id), pregunta.trim());
        res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
        console.error("Error al crear pregunta:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * PATCH /api/rh/preguntas/:id
 * Actualiza el texto de una pregunta.
 * Body: { pregunta }
 */
router.patch("/rh/preguntas/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { pregunta } = req.body;
        if (!pregunta?.trim()) {
            return res.status(400).json({
                success: false,
                message: "El texto de la pregunta es requerido",
            });
        }
        const result = await updatePregunta(Number(id), pregunta.trim());
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error("Error al actualizar pregunta:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
/**
 * DELETE /api/rh/preguntas/:id
 * Elimina una pregunta.
 * No se puede eliminar si tiene respuestas en evaluaciones.
 */
router.delete("/rh/preguntas/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await deletePregunta(Number(id));
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error("Error al eliminar pregunta:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/rh/plantillas
router.get("/rh/plantillas", authMiddleware, async (req, res) => {
    try {
        const plantillas = await getAllPlantillas();
        res.json({ success: true, data: plantillas });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/rh/plantillas/:id
router.get("/rh/plantillas/:id", authMiddleware, async (req, res) => {
    try {
        const plantilla = await getPlantillaById(Number(req.params.id));
        if (!plantilla)
            return res
                .status(404)
                .json({ success: false, message: "Plantilla no encontrada" });
        res.json({ success: true, data: plantilla });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/rh/plantillas
router.post("/rh/plantillas", authMiddleware, async (req, res) => {
    try {
        const { nombre, descripcion } = req.body;
        if (!nombre?.trim())
            return res
                .status(400)
                .json({ success: false, message: "El nombre es requerido" });
        const result = await createPlantilla(
            nombre.trim(),
            descripcion?.trim() || null,
        );
        res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PATCH /api/rh/plantillas/:id
router.patch("/rh/plantillas/:id", authMiddleware, async (req, res) => {
    try {
        const { nombre, descripcion } = req.body;
        if (!nombre?.trim())
            return res
                .status(400)
                .json({ success: false, message: "El nombre es requerido" });
        const result = await updatePlantilla(
            Number(req.params.id),
            nombre.trim(),
            descripcion?.trim() || null,
        );
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/rh/plantillas/:id
router.delete("/rh/plantillas/:id", authMiddleware, async (req, res) => {
    try {
        const result = await deletePlantilla(Number(req.params.id));
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/rh/plantillas/:plantillaId/secciones
router.post(
    "/rh/plantillas/:plantillaId/secciones",
    authMiddleware,
    async (req, res) => {
        try {
            const { nombre } = req.body;
            if (!nombre?.trim())
                return res
                    .status(400)
                    .json({ success: false, message: "El nombre es requerido" });
            const result = await createSeccion(
                nombre.trim(),
                Number(req.params.plantillaId),
            );
            res.status(result.success ? 201 : 400).json(result);
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    },
);
// GET /api/supervisor/vacaciones/todas
router.get("/supervisor/vacaciones/todas", authMiddleware, async (req, res) => {
    try {
        const vacaciones = await getTodasVacaciones();
        res.json({ success: true, data: vacaciones });
    } catch (error) {
        console.error("Error en /supervisor/vacaciones/todas:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
router.get("/evaluaciones/:id/word", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const evaluacion = await getEvaluacionById(id);
        if (!evaluacion) {
            return res
                .status(404)
                .json({ success: false, message: "Evaluación no encontrada" });
        }

        const buffer = await generarWordEvaluacion(evaluacion);

        const nombreArchivo = `evaluacion_${evaluacion.empleado_apPaterno || "empleado"}_${id}.docx`;

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${nombreArchivo}"`,
        );
        res.send(buffer);
    } catch (error) {
        console.error("Error al generar Word:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/rh/notificaciones — lista notificaciones pendientes
router.get("/rh/notificaciones", authMiddleware, async (req, res) => {
    try {
        const soloNoLeidas = req.query.noLeidas === "true";
        const notificaciones = await getNotificacionesRH(soloNoLeidas);
        res.json({ success: true, data: notificaciones });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/rh/notificaciones/count — badge contador
router.get("/rh/notificaciones/count", authMiddleware, async (req, res) => {
    try {
        const total = await contarNoLeidas();
        res.json({ success: true, data: { total } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PATCH /api/rh/notificaciones/:id/leer — marcar como leída
router.patch(
    "/rh/notificaciones/:id/leer",
    authMiddleware,
    async (req, res) => {
        try {
            await marcarComoLeida(Number(req.params.id));
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    },
);
router.get("/departamentos", async (req, res) => {
    try {
        const departamentos = await getDepartamentos();
        res.json({ success: true, data: departamentos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/rh/notificaciones/generar-todos — solo para inicializar
router.get(
    "/rh/notificaciones/generar-todos",
    authMiddleware,
    async (req, res) => {
        try {
            const result = await generarNotificaciones();
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    },
);
// GET /api/rh/cumpleanos — cumpleaños del mes actual agrupados por día
router.get("/rh/cumpleanos", authMiddleware, async (req, res) => {
    try {
        const mes = req.query.mes
            ? Number(req.query.mes)
            : new Date().getMonth() + 1;
        const rows = await new Promise((resolve, reject) => {
            connection.query(
                `
                SELECT
                    usuarioId, nombre, apPaterno, apMaterno,
                    foto, fecha_nacimiento,
                    DAY(fecha_nacimiento)   AS dia,
                    MONTH(fecha_nacimiento) AS mes,
                    YEAR(fecha_nacimiento)  AS anio,
                    TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad,
                    departamento, nombre_puesto
                FROM usuarios u
                LEFT JOIN puesto p ON u.puestoId = p.puestoId
                WHERE MONTH(fecha_nacimiento) = ?
                  AND fecha_nacimiento IS NOT NULL
                ORDER BY DAY(fecha_nacimiento)
            `,
                [mes],
                (err, results) => (err ? reject(err) : resolve(results)),
            );
        });
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/rh/cumpleanos/manana — para el badge/notificación
router.get("/rh/cumpleanos/manana", authMiddleware, async (req, res) => {
    try {
        const rows = await new Promise((resolve, reject) => {
            connection.query(
                `
                SELECT
                    usuarioId, nombre, apPaterno, apMaterno,
                    foto, fecha_nacimiento, departamento,
                    TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) + 1 AS edad
                FROM usuarios u
                WHERE DAY(fecha_nacimiento)   = DAY(DATE_ADD(CURDATE(), INTERVAL 1 DAY))
                  AND MONTH(fecha_nacimiento) = MONTH(DATE_ADD(CURDATE(), INTERVAL 1 DAY))
                  AND fecha_nacimiento IS NOT NULL
            `,
                (err, results) => (err ? reject(err) : resolve(results)),
            );
        });
        res.json({ success: true, data: rows, total: rows.length });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
router.get("/rh/vacaciones/:id/excel", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await new Promise((resolve, reject) => {
            connection.query(
                `SELECT v.*,
                    u.nombre, u.apPaterno, u.apMaterno,
                    u.usuarioId, u.departamento, u.fechaContratacion,
                    p.nombre_puesto,
                    TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) AS anios_servicio,
                    -- Días LFT según antigüedad
                    CASE
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 25 THEN 32
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 20 THEN 30
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 15 THEN 28
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 10 THEN 24
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 5  THEN 18
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 4  THEN 16
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 3  THEN 14
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 2  THEN 10
                        WHEN TIMESTAMPDIFF(YEAR, u.fechaContratacion, CURDATE()) >= 1  THEN 8
                    ELSE 0
                    END AS dias_vacaciones_lft,
                    -- Días usados en el año actual
                    COALESCE((
                        SELECT SUM(dias_solicitados) FROM vacaciones
                        WHERE usuarioId = u.usuarioId
                        AND estado_final = 'Aceptadas'
                         AND YEAR(fecha_inicio_vacaciones) = YEAR(CURDATE())
                    ), 0) AS dias_usados
                    FROM vacaciones v
                    LEFT JOIN usuarios u ON v.usuarioId = u.usuarioId
                    LEFT JOIN puesto   p ON u.puestoId  = p.puestoId
                    WHERE v.vacacionesId = ?`,
                [id],
                (err, r) => (err ? reject(err) : resolve(r)),
            );
        });
        const row = rows[0];
        row.dias_restantes = (row.dias_vacaciones_lft || 0) - (row.dias_usados || 0);

        if (!rows.length)
            return res
                .status(404)
                .json({ success: false, message: "Vacación no encontrada" });

        const buffer = await generarExcelVacaciones(rows[0]);
        const nombre = `vacaciones_${rows[0].apPaterno || "empleado"}_${id}.xlsx`;

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// Empleado solicita permiso
router.post('/empleados/permisos', authMiddleware, async (req, res) => {
    try {
        const result = await crearPermiso(req.user.usuarioId, req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Empleado ve sus permisos
router.get('/empleados/permisos', authMiddleware, async (req, res) => {
    try {
        const permisos = await getPermisosByEmpleado(req.user.usuarioId);
        res.json({ success: true, data: permisos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// RH/Supervisor ve todos los permisos
router.get('/rh/permisos', authMiddleware, async (req, res) => {
    try {
        const permisos = await getTodosPermisos();
        res.json({ success: true, data: permisos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// RH responde permiso
router.patch('/rh/permisos/:id/responder', authMiddleware, async (req, res) => {
    try {
        const { estado } = req.body;
        if (!['autorizado', 'rechazado'].includes(estado))
            return res.status(400).json({ success: false, message: 'Estado inválido' });
        const result = await responderPermiso(Number(req.params.id), estado);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Descargar Word del permiso
router.get('/rh/permisos/:id/word', authMiddleware, async (req, res) => {
    try {
        const permiso = await getPermisoById(Number(req.params.id));
        if (!permiso) return res.status(404).json({ success: false, message: 'Permiso no encontrado' });
        const buffer = await generarWordPermiso(permiso);
        const nombre = `permiso_${permiso.apPaterno || 'empleado'}_${req.params.id}.docx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Eliminar permiso
router.delete('/rh/permisos/:id', authMiddleware, async (req, res) => {
    try {
        const result = await deletePermiso(Number(req.params.id));
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// Guardar vehículo
router.post('/rh/empleados/:id/vehiculo', authMiddleware, async (req, res) => {
    try {
        const result = await upsertVehiculo(Number(req.params.id), req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Agregar hijo
router.post('/rh/empleados/:id/hijos', authMiddleware, async (req, res) => {
    try {
        const { nombre, fecha_nacimiento } = req.body;
        const result = await addHijo(Number(req.params.id), nombre, fecha_nacimiento);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Eliminar hijo
router.delete('/rh/hijos/:id', authMiddleware, async (req, res) => {
    try {
        const result = await deleteHijo(Number(req.params.id));
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
module.exports = router;
